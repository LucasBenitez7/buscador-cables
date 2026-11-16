// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  setUserGrants: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/session", () => ({ authorize: mocks.authorize }));
vi.mock("@/server/roles/service", () => ({
  RoleServiceError: class RoleServiceError extends Error {},
  createRole: mocks.createRole,
  updateRole: mocks.updateRole,
  deleteRole: mocks.deleteRole,
  setUserGrants: mocks.setUserGrants,
}));

const { createRoleAction, deleteRoleAction, setUserGrantsAction, updateRoleAction } =
  await import("./actions");
const { RoleServiceError } = await import("@/server/roles/service");

const admin = { ok: true, user: { id: "a", permissions: ["role:manage"] } };

describe("role actions", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.authorize.mockResolvedValue(admin);
  });

  it("check the role management permission before anything else", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, message: "No tienes permiso." });

    for (const result of [
      await createRoleAction({ name: "X", permissions: [] }),
      await updateRoleAction({ id: "r", version: 1, name: "X", permissions: [] }),
      await deleteRoleAction({ id: "r", version: 1 }),
      await setUserGrantsAction({ userId: "u", permissions: [] }),
    ]) {
      expect(result).toEqual({ ok: false, message: "No tienes permiso." });
    }
    expect(mocks.authorize).toHaveBeenCalledWith("role:manage");
    for (const task of [
      mocks.createRole,
      mocks.updateRole,
      mocks.deleteRole,
      mocks.setUserGrants,
    ]) {
      expect(task).not.toHaveBeenCalled();
    }
  });

  it("refuse hand-made requests that ask for account management or bad data", async () => {
    expect(await createRoleAction({ name: "Jefe", permissions: ["user:manage"] })).toMatchObject({
      ok: false,
    });
    expect(await setUserGrantsAction({ userId: "u", permissions: ["role:manage"] })).toMatchObject({
      ok: false,
    });
    expect(await deleteRoleAction("basura")).toMatchObject({ ok: false });
    expect(mocks.createRole).not.toHaveBeenCalled();
    expect(mocks.setUserGrants).not.toHaveBeenCalled();
  });

  it("create a role with clean data and refresh the pages", async () => {
    mocks.createRole.mockResolvedValue({ id: "r1", name: "Conexionista" });

    expect(
      await createRoleAction({ name: " Conexionista ", permissions: ["cable:connect"] }),
    ).toEqual({ ok: true, message: "Rol «Conexionista» creado.", id: "r1" });
    expect(mocks.createRole).toHaveBeenCalledWith(admin.user, {
      name: "Conexionista",
      description: null,
      permissions: ["cable:read", "cable:connect"],
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/roles");
  });

  it("show the service's own errors and hide unexpected ones", async () => {
    mocks.deleteRole.mockRejectedValueOnce(new RoleServiceError("Hay 1 persona con este rol."));
    expect(await deleteRoleAction({ id: "r", version: 1 })).toEqual({
      ok: false,
      message: "Hay 1 persona con este rol.",
    });

    mocks.deleteRole.mockRejectedValueOnce(new Error("conexión perdida"));
    expect(await deleteRoleAction({ id: "r", version: 1 })).toEqual({
      ok: false,
      message: "No se pudo guardar. Inténtalo de nuevo.",
    });
  });
});
