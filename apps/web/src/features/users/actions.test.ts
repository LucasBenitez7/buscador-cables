// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createUser: vi.fn(),
  changeUserRole: vi.fn(),
  setUserActive: vi.fn(),
  notifyAccountChange: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/session", () => ({ authorize: mocks.authorize }));
vi.mock("@/server/account-notifications", () => ({
  notifyAccountChange: mocks.notifyAccountChange,
}));
vi.mock("@/server/users/service", () => ({
  UserServiceError: class UserServiceError extends Error {},
  createUser: mocks.createUser,
  changeUserRole: mocks.changeUserRole,
  setUserActive: mocks.setUserActive,
}));

const { changeRoleAction, createUserAction, setUserActiveAction } = await import("./actions");
const { UserServiceError } = await import("@/server/users/service");

const admin = { id: "u1", name: "Ada", email: "ada@planta.example", role: "ADMIN" };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

describe("user actions", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.authorize.mockResolvedValue({ ok: true, user: admin });
    mocks.setUserActive.mockImplementation(async (_actor, input: { active: boolean }) => ({
      action: input.active ? "REACTIVATED" : "DEACTIVATED",
      user: { id: "u2", name: "Ana", email: "ana@planta.example" },
    }));
    mocks.createUser.mockImplementation(
      async (_actor, input: { name: string; email: string; role: string }) => ({
        id: "u9",
        ...input,
      }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it.each([
    ["createUserAction", () => createUserAction(null, form({}))],
    ["changeRoleAction", () => changeRoleAction(form({}))],
    ["setUserActiveAction", () => setUserActiveAction(form({}))],
  ])("%s requires user:manage", async (_name, run) => {
    mocks.authorize.mockResolvedValue({ ok: false, message: "No tienes permiso." });

    const result = await run();

    expect(mocks.authorize).toHaveBeenCalledWith("user:manage");
    expect(result).toEqual({ ok: false, message: "No tienes permiso." });
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.changeUserRole).not.toHaveBeenCalled();
    expect(mocks.setUserActive).not.toHaveBeenCalled();
  });

  it("creates a user with normalized data", async () => {
    const result = await createUserAction(
      null,
      form({
        name: "  Ana Pérez ",
        email: "Ana@Planta.Example",
        role: "TECHNICIAN",
        password: "clave-temporal-1",
      }),
    );

    expect(mocks.createUser).toHaveBeenCalledWith(admin, {
      name: "Ana Pérez",
      email: "ana@planta.example",
      role: "TECHNICIAN",
      password: "clave-temporal-1",
    });
    expect(result).toEqual({
      ok: true,
      message: "Usuario ana@planta.example creado. Se le ha enviado un correo de bienvenida.",
    });
    expect(mocks.notifyAccountChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CREATED", toRole: "TECHNICIAN" }),
      admin,
    );
  });

  it("rejects invalid input before reaching the service", async () => {
    const result = await createUserAction(
      null,
      form({
        name: "Ana",
        email: "ana@planta.example",
        role: "../ROOT",
        password: "clave-temporal-1",
      }),
    );

    expect(result).toEqual({ ok: false, message: "Rol no válido" });
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("shows the service's message and hides unexpected errors", async () => {
    mocks.changeUserRole.mockRejectedValueOnce(new UserServiceError("No puedes cambiar tu rol."));
    const refused = await changeRoleAction(form({ userId: "u2", role: "VIEWER" }));
    expect(refused).toEqual({ ok: false, message: "No puedes cambiar tu rol." });

    mocks.changeUserRole.mockRejectedValueOnce(new Error("connection refused 10.0.0.5"));
    const crashed = await changeRoleAction(form({ userId: "u2", role: "VIEWER" }));
    expect(crashed).toEqual({
      ok: false,
      message: "No se pudo completar la operación. Inténtalo de nuevo.",
    });
  });

  // Fase 10: la persona sabe por correo todo lo que pasa con su cuenta.
  it("tells the person when the account is deactivated or reactivated", async () => {
    const off = await setUserActiveAction(form({ userId: "u2", active: "false" }));
    const on = await setUserActiveAction(form({ userId: "u2", active: "true" }));

    expect(mocks.setUserActive).toHaveBeenNthCalledWith(1, admin, { userId: "u2", active: false });
    expect(off).toEqual({ ok: true, message: "Usuario desactivado. Se le ha avisado por correo." });
    expect(on).toEqual({ ok: true, message: "Usuario reactivado. Se le ha avisado por correo." });
    expect(mocks.notifyAccountChange.mock.calls.map(([change]) => change.action)).toEqual([
      "DEACTIVATED",
      "REACTIVATED",
    ]);
  });

  // Revisión F0-F7 (A2): al aprobar una cuenta registrada se avisa a su dueño.
  it("tells the user when their account is approved, with its role", async () => {
    const change = {
      action: "APPROVED",
      user: { id: "u3", name: "Nico Nuevo", email: "nico@planta.example" },
      toRole: "TECHNICIAN",
    };
    mocks.setUserActive.mockResolvedValue(change);

    const result = await setUserActiveAction(
      form({ userId: "u3", active: "true", role: "TECHNICIAN" }),
    );

    expect(mocks.setUserActive).toHaveBeenCalledWith(admin, {
      userId: "u3",
      active: true,
      role: "TECHNICIAN",
    });
    expect(mocks.notifyAccountChange).toHaveBeenCalledWith(change, admin);
    expect(result).toEqual({
      ok: true,
      message: "Cuenta aprobada. Se ha avisado al usuario por correo.",
    });
  });

  it("only emails a role change that changed something", async () => {
    mocks.changeUserRole.mockResolvedValueOnce(null);
    expect(await changeRoleAction(form({ userId: "u2", role: "VIEWER" }))).toEqual({
      ok: true,
      message: "Ya tenía ese rol.",
    });
    expect(mocks.notifyAccountChange).not.toHaveBeenCalled();

    const change = {
      action: "ROLE_CHANGED",
      user: { id: "u2" },
      fromRole: "VIEWER",
      toRole: "ADMIN",
    };
    mocks.changeUserRole.mockResolvedValueOnce(change);
    expect(await changeRoleAction(form({ userId: "u2", role: "ADMIN" }))).toEqual({
      ok: true,
      message: "Rol actualizado. Se le ha avisado por correo.",
    });
    expect(mocks.notifyAccountChange).toHaveBeenCalledWith(change, admin);
  });
});
