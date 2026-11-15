// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createUser: vi.fn(),
  changeUserRole: vi.fn(),
  setUserActive: vi.fn(),
  notifyAccountApproved: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/session", () => ({ authorize: mocks.authorize }));
vi.mock("@/server/account-approval", () => ({
  notifyAccountApproved: mocks.notifyAccountApproved,
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
    mocks.setUserActive.mockResolvedValue({ approved: null });
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
    expect(result).toEqual({ ok: true, message: "Usuario ana@planta.example creado." });
  });

  it("rejects invalid input before reaching the service", async () => {
    const result = await createUserAction(
      null,
      form({
        name: "Ana",
        email: "ana@planta.example",
        role: "ROOT",
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

  it("deactivates and reactivates without sending any email", async () => {
    const off = await setUserActiveAction(form({ userId: "u2", active: "false" }));
    const on = await setUserActiveAction(form({ userId: "u2", active: "true" }));

    expect(mocks.setUserActive).toHaveBeenNthCalledWith(1, admin, { userId: "u2", active: false });
    expect(off).toEqual({ ok: true, message: "Usuario desactivado." });
    expect(on).toEqual({ ok: true, message: "Usuario reactivado." });
    expect(mocks.notifyAccountApproved).not.toHaveBeenCalled();
  });

  // Revisión F0-F7 (A2): al aprobar una cuenta registrada se avisa a su dueño.
  it("tells the user when their account is approved", async () => {
    const applicant = { name: "Nico Nuevo", email: "nico@planta.example" };
    mocks.setUserActive.mockResolvedValue({ approved: applicant });

    const result = await setUserActiveAction(form({ userId: "u3", active: "true" }));

    expect(mocks.notifyAccountApproved).toHaveBeenCalledWith(applicant);
    expect(result).toEqual({
      ok: true,
      message: "Cuenta aprobada. Se ha avisado al usuario por correo.",
    });
  });
});
