// @vitest-environment node
import { APIError } from "better-auth/api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_ERROR_CODES } from "@/lib/auth-errors";
import { assertAccountActive } from "./auth-policy";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@cables/db", () => ({ prisma: { user: { findUnique } } }));

describe("assertAccountActive", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("allows active accounts", async () => {
    findUnique.mockResolvedValue({ active: true });

    await expect(assertAccountActive("u1")).resolves.toBeUndefined();
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "u1" }, select: { active: true } });
  });

  // Regresión: un usuario desactivado podía volver a iniciar sesión con su contraseña.
  it("rejects deactivated accounts with ACCOUNT_DISABLED", async () => {
    findUnique.mockResolvedValue({ active: false });

    const error = await assertAccountActive("u1").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(APIError);
    expect((error as APIError).status).toBe("FORBIDDEN");
    expect((error as APIError).body?.code).toBe(AUTH_ERROR_CODES.ACCOUNT_DISABLED);
  });

  it("rejects accounts that no longer exist", async () => {
    findUnique.mockResolvedValue(null);

    await expect(assertAccountActive("ghost")).rejects.toBeInstanceOf(APIError);
  });
});
