// @vitest-environment node
import { APIError } from "better-auth/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_ERROR_CODES } from "@/lib/auth-errors";
import { assertAccountActive, assertNoProfileSelfEdit, prepareSignUpUser } from "./auth-policy";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@cables/db", () => ({ prisma: { user: { findUnique } } }));

function caught(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
}

describe("assertAccountActive", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("allows active accounts", async () => {
    findUnique.mockResolvedValue({ active: true, approvedAt: new Date() });

    await expect(assertAccountActive("u1")).resolves.toBeUndefined();
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { active: true, approvedAt: true },
    });
  });

  // Regresión: un usuario desactivado podía volver a iniciar sesión con su contraseña.
  it("rejects deactivated accounts with ACCOUNT_DISABLED", async () => {
    findUnique.mockResolvedValue({ active: false, approvedAt: new Date() });

    const error = await assertAccountActive("u1").catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(APIError);
    expect((error as APIError).status).toBe("FORBIDDEN");
    expect((error as APIError).body?.code).toBe(AUTH_ERROR_CODES.ACCOUNT_DISABLED);
  });

  // Revisión F0-F7 (A2): una cuenta registrada no entra hasta que un administrador la aprueba.
  it("rejects accounts nobody approved yet with ACCOUNT_PENDING", async () => {
    findUnique.mockResolvedValue({ active: false, approvedAt: null });

    const error = await assertAccountActive("u1").catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(APIError);
    expect((error as APIError).status).toBe("FORBIDDEN");
    expect((error as APIError).body?.code).toBe(AUTH_ERROR_CODES.ACCOUNT_PENDING);
  });

  it("rejects accounts that no longer exist", async () => {
    findUnique.mockResolvedValue(null);

    await expect(assertAccountActive("ghost")).rejects.toBeInstanceOf(APIError);
  });
});

describe("prepareSignUpUser", () => {
  const base = { id: "u9", name: "  Luis Gómez ", email: "Luis@Planta.example", image: null };

  // Revisión F0-F7 (A2): antes la cuenta nueva quedaba activa y leía todos los datos.
  it("normalizes the profile and forces a VIEWER that waits for approval", () => {
    const { data } = prepareSignUpUser({ ...base, role: "ADMIN", active: true });

    expect(data).toMatchObject({
      id: "u9",
      name: "Luis Gómez",
      email: "luis@planta.example",
      role: "VIEWER",
      active: false,
    });
  });

  it("rejects an invalid name with INVALID_PROFILE", () => {
    const error = caught(() => prepareSignUpUser({ ...base, name: " " }));

    expect(error).toBeInstanceOf(APIError);
    expect((error as APIError).body?.code).toBe(AUTH_ERROR_CODES.INVALID_PROFILE);
  });
});

// Revisión F0-F7 (M1): `/api/auth/update-user` dejaba a cualquiera cambiarse el nombre y
// firmar el historial como otra persona.
describe("assertNoProfileSelfEdit", () => {
  it.each([{ name: "Juan Pérez" }, { image: "https://x.example/a.png" }, { email: "a@b.example" }])(
    "rejects %j with PROFILE_LOCKED",
    (data) => {
      const error = caught(() => assertNoProfileSelfEdit(data));

      expect(error).toBeInstanceOf(APIError);
      expect((error as APIError).status).toBe("FORBIDDEN");
      expect((error as APIError).body?.code).toBe(AUTH_ERROR_CODES.PROFILE_LOCKED);
    },
  );

  it("lets Better Auth's own updates through", () => {
    expect(() => assertNoProfileSelfEdit({ emailVerified: true })).not.toThrow();
    expect(() => assertNoProfileSelfEdit({ updatedAt: new Date() })).not.toThrow();
  });
});
