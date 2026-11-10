import { describe, expect, it } from "vitest";
import { AUTH_ERROR_CODES, signInErrorMessage } from "./auth-errors";

describe("signInErrorMessage", () => {
  it("asks the user to wait when rate limited", () => {
    expect(signInErrorMessage({ status: 429 })).toMatch(/demasiados intentos/i);
  });

  it("explains that the account is deactivated", () => {
    expect(signInErrorMessage({ status: 403, code: AUTH_ERROR_CODES.ACCOUNT_DISABLED })).toMatch(
      /desactivada/,
    );
  });

  it("uses a generic message for wrong credentials", () => {
    expect(signInErrorMessage({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      "Correo o contraseña incorrectos.",
    );
  });
});
