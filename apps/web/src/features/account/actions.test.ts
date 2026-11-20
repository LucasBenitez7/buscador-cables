// @vitest-environment node
import { APIError } from "better-auth/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  changeOwnName: vi.fn(),
  changePassword: vi.fn(),
  revokeOtherSessions: vi.fn(),
  revalidatePath: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      changePassword: mocks.changePassword,
      revokeOtherSessions: mocks.revokeOtherSessions,
    },
  },
}));
vi.mock("@/server/log", () => ({ logError: mocks.logError }));
vi.mock("@/server/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/users/service", () => ({
  UserServiceError: class UserServiceError extends Error {},
  changeOwnName: mocks.changeOwnName,
}));

const { changeOwnNameAction, changePasswordAction } = await import("./actions");

const me = { id: "u1", name: "Ana Pérez", email: "ana@planta.example", role: "TECHNICIAN" };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const passwords = {
  currentPassword: "clave-actual-1",
  newPassword: "clave-nueva-12",
  confirmPassword: "clave-nueva-12",
};

describe("account actions", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getCurrentUser.mockResolvedValue(me);
  });

  it("need a session", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    expect((await changeOwnNameAction(null, form({ name: "Ana" }))).ok).toBe(false);
    expect((await changePasswordAction(null, form(passwords))).ok).toBe(false);
    expect(mocks.changeOwnName).not.toHaveBeenCalled();
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  describe("changeOwnNameAction", () => {
    it("changes the name of whoever is signed in, never of an id from the form", async () => {
      mocks.changeOwnName.mockResolvedValue(true);

      const result = await changeOwnNameAction(
        null,
        form({ name: "  Ana   Pérez García ", userId: "u2" }),
      );

      expect(result).toEqual({ ok: true, message: "Nombre guardado." });
      expect(mocks.changeOwnName).toHaveBeenCalledWith(me, { name: "Ana Pérez García" });
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    });

    // Alguien se registró con su correo como nombre: tampoco se lo puede poner después.
    it("rejects an email as the name without touching the account", async () => {
      const result = await changeOwnNameAction(null, form({ name: "ana@planta.example" }));

      expect(result).toEqual({
        ok: false,
        message: "Escribe tu nombre y apellidos, no tu correo",
      });
      expect(mocks.changeOwnName).not.toHaveBeenCalled();
    });

    it("says so when the name is the same", async () => {
      mocks.changeOwnName.mockResolvedValue(false);

      expect(await changeOwnNameAction(null, form({ name: "Ana Pérez" }))).toEqual({
        ok: true,
        message: "Ese ya es tu nombre.",
      });
    });

    it("hides unexpected errors", async () => {
      mocks.changeOwnName.mockRejectedValue(new Error("conexión perdida"));

      const result = await changeOwnNameAction(null, form({ name: "Ana Pérez" }));

      expect(result.ok).toBe(false);
      expect(result.message).not.toMatch(/conexión/);
      expect(mocks.logError).toHaveBeenCalled();
    });
  });

  describe("changePasswordAction", () => {
    // Regresión: con `revokeOtherSessions` en el cambio, Better Auth cerraba también esta
    // sesión y la página mandaba al login y de ahí al inicio, sin el mensaje.
    it("changes it keeping this session, and then closes only the other ones", async () => {
      mocks.changePassword.mockResolvedValue({ token: null, user: me });
      mocks.revokeOtherSessions.mockResolvedValue({ status: true });

      const result = await changePasswordAction(null, form(passwords));

      expect(result).toEqual({
        ok: true,
        message: "Contraseña cambiada. Se han cerrado tus otras sesiones.",
      });
      expect(mocks.changePassword).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { currentPassword: "clave-actual-1", newPassword: "clave-nueva-12" },
        }),
      );
      expect(mocks.revokeOtherSessions).toHaveBeenCalledOnce();
    });

    it("says so when the other sessions could not be closed", async () => {
      mocks.changePassword.mockResolvedValue({ token: null, user: me });
      mocks.revokeOtherSessions.mockRejectedValue(new Error("conexión perdida"));

      const result = await changePasswordAction(null, form(passwords));

      expect(result.ok).toBe(true);
      expect(result.message).toMatch(/no se pudieron cerrar tus otras sesiones/);
    });

    it.each([
      [{ confirmPassword: "otra-clave-123" }, "Las contraseñas no coinciden"],
      [{ newPassword: "corta", confirmPassword: "corta" }, "al menos 10 caracteres"],
      [
        { newPassword: "clave-actual-1", confirmPassword: "clave-actual-1" },
        "distinta de la actual",
      ],
      [{ currentPassword: "" }, "contraseña actual"],
    ])("checks the form on the server (%j)", async (change, message) => {
      const result = await changePasswordAction(null, form({ ...passwords, ...change }));

      expect(result.ok).toBe(false);
      expect(result.message).toContain(message);
      expect(mocks.changePassword).not.toHaveBeenCalled();
    });

    it("says when the current password is wrong", async () => {
      mocks.changePassword.mockRejectedValue(
        APIError.from("BAD_REQUEST", { code: "INVALID_PASSWORD", message: "Invalid password" }),
      );

      expect(await changePasswordAction(null, form(passwords))).toEqual({
        ok: false,
        message: "La contraseña actual no es correcta.",
      });
      expect(mocks.revokeOtherSessions).not.toHaveBeenCalled();
    });

    it("says when there were too many attempts", async () => {
      mocks.changePassword.mockRejectedValue(
        APIError.from("TOO_MANY_REQUESTS", { code: "LOCKED", message: "locked" }),
      );

      const result = await changePasswordAction(null, form(passwords));

      expect(result.ok).toBe(false);
      expect(result.message).toMatch(/demasiados intentos/i);
    });
  });
});
