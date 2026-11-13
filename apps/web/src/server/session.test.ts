// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, redirect } = vi.hoisted(() => ({
  getSession: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));

// `cache` de React solo deduplica dentro de una petición de React; fuera de ella
// se comporta como la función original, que es lo que queremos probar aquí.
const { authorize, getCurrentUser, requirePermission, requireUser, whenSignedIn } =
  await import("./session");

function sessionFor(user: { role: string; active: boolean }) {
  return {
    session: { id: "s1" },
    user: { id: "u1", name: "Ana", email: "ana@cables.test", ...user },
  };
}

describe("session helpers", () => {
  beforeEach(() => {
    getSession.mockReset();
    redirect.mockClear();
  });

  // Revisión F0-F7 (B1): generateMetadata leía el cable o la bandeja sin comprobar la sesión.
  describe("whenSignedIn", () => {
    it("does not run the loader without a valid session", async () => {
      getSession.mockResolvedValue(null);
      const load = vi.fn(async () => "datos");

      await expect(whenSignedIn(load)).resolves.toBeNull();
      expect(load).not.toHaveBeenCalled();
    });

    it("does not run the loader for a deactivated account", async () => {
      getSession.mockResolvedValue(sessionFor({ role: "ADMIN", active: false }));
      const load = vi.fn(async () => "datos");

      await expect(whenSignedIn(load)).resolves.toBeNull();
      expect(load).not.toHaveBeenCalled();
    });

    it("returns what the loader returns for a signed-in user", async () => {
      getSession.mockResolvedValue(sessionFor({ role: "VIEWER", active: true }));

      await expect(whenSignedIn(async () => "datos")).resolves.toBe("datos");
    });
  });

  describe("getCurrentUser", () => {
    it("returns null for anonymous requests", async () => {
      getSession.mockResolvedValue(null);

      await expect(getCurrentUser()).resolves.toBeNull();
    });

    it("returns the user with a valid role", async () => {
      getSession.mockResolvedValue(sessionFor({ role: "TECHNICIAN", active: true }));

      await expect(getCurrentUser()).resolves.toEqual({
        id: "u1",
        name: "Ana",
        email: "ana@cables.test",
        role: "TECHNICIAN",
      });
    });

    it("treats deactivated accounts as anonymous", async () => {
      getSession.mockResolvedValue(sessionFor({ role: "ADMIN", active: false }));

      await expect(getCurrentUser()).resolves.toBeNull();
    });

    it("treats unknown roles as anonymous", async () => {
      getSession.mockResolvedValue(sessionFor({ role: "ROOT", active: true }));

      await expect(getCurrentUser()).resolves.toBeNull();
    });
  });

  describe("requireUser and requirePermission", () => {
    it("sends anonymous users to /login", async () => {
      getSession.mockResolvedValue(null);

      await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT:/login");
    });

    it("sends users without the permission to /", async () => {
      getSession.mockResolvedValue(sessionFor({ role: "VIEWER", active: true }));

      await expect(requirePermission("user:manage")).rejects.toThrow("NEXT_REDIRECT:/");
    });

    it("returns the user when the permission is granted", async () => {
      getSession.mockResolvedValue(sessionFor({ role: "ADMIN", active: true }));

      await expect(requirePermission("user:manage")).resolves.toMatchObject({ role: "ADMIN" });
      expect(redirect).not.toHaveBeenCalled();
    });
  });

  describe("authorize", () => {
    it("fails with an expired-session message for anonymous requests", async () => {
      getSession.mockResolvedValue(null);

      await expect(authorize("cable:read")).resolves.toEqual({
        ok: false,
        message: expect.stringMatching(/sesión ha caducado/),
      });
    });

    it("fails without the permission", async () => {
      getSession.mockResolvedValue(sessionFor({ role: "TECHNICIAN", active: true }));

      await expect(authorize("cable:retire")).resolves.toMatchObject({ ok: false });
    });

    it("succeeds with the permission", async () => {
      getSession.mockResolvedValue(sessionFor({ role: "SUPERVISOR", active: true }));

      await expect(authorize("cable:retire")).resolves.toMatchObject({
        ok: true,
        user: { role: "SUPERVISOR" },
      });
    });
  });
});
