// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, redirect, findUnique } = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUnique: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@cables/db", () => ({ prisma: { user: { findUnique } } }));

// `cache` de React solo deduplica dentro de una petición de React; fuera de ella
// se comporta como la función original, que es lo que queremos probar aquí.
const { PERMISSIONS, ROLE_PERMISSIONS } = await import("@cables/shared");
type Role = keyof typeof ROLE_PERMISSIONS;

const { authorize, getCurrentUser, requirePermission, requireUser, whenSignedIn } =
  await import("./session");

const ROLE_NAMES: Record<string, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  TECHNICIAN: "Técnico",
  VIEWER: "Consulta",
};

/**
 * A session and, behind it, the row the session re-reads (fase 12): the role with its
 * permissions in the database, and the extras of the person.
 */
function sessionFor(
  user: { role: string; active: boolean },
  extras: { rolePermissions?: string[]; grants?: string[] } = {},
) {
  findUnique.mockResolvedValue({
    id: "u1",
    name: "Ana",
    email: "ana@cables.test",
    active: user.active,
    role: user.role,
    roleInfo: {
      name: ROLE_NAMES[user.role] ?? user.role,
      permissions: extras.rolePermissions ?? [
        ...(ROLE_PERMISSIONS[user.role as Role] ?? ["cable:read"]),
      ],
    },
    permissionGrants: (extras.grants ?? []).map((permission) => ({ permission })),
  });
  return {
    session: { id: "s1" },
    user: { id: "u1", name: "Ana", email: "ana@cables.test", ...user },
  };
}

describe("session helpers", () => {
  beforeEach(() => {
    getSession.mockReset();
    findUnique.mockReset();
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
        roleName: "Técnico",
        permissions: PERMISSIONS.filter((p) => ROLE_PERMISSIONS.TECHNICIAN.includes(p)),
        extraCount: 0,
      });
    });

    // Fase 12: lo que puede hacer sale de la base en cada petición, rol más extras.
    it("adds the extras of the person and counts them", async () => {
      getSession.mockResolvedValue(
        sessionFor({ role: "TECHNICIAN", active: true }, { grants: ["cable:retire"] }),
      );

      const user = await getCurrentUser();
      expect(user?.permissions).toContain("cable:retire");
      expect(user?.extraCount).toBe(1);
    });

    it("never gives account or role management outside the administrator role", async () => {
      getSession.mockResolvedValue(
        sessionFor(
          { role: "r-hecho-a-mano", active: true },
          { rolePermissions: ["cable:read", "user:manage"], grants: ["role:manage"] },
        ),
      );

      expect((await getCurrentUser())?.permissions).toEqual(["cable:read"]);
    });

    it("treats an account deactivated since the session started as anonymous", async () => {
      getSession.mockResolvedValue(sessionFor({ role: "ADMIN", active: true }));
      findUnique.mockResolvedValue(null);

      await expect(getCurrentUser()).resolves.toBeNull();
    });

    it("treats deactivated accounts as anonymous", async () => {
      getSession.mockResolvedValue(sessionFor({ role: "ADMIN", active: false }));

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
