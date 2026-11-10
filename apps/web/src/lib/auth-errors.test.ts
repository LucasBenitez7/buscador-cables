import { describe, expect, it } from "vitest";
import { AUTH_ERROR_CODES, signInErrorMessage, verifyEmailErrorMessage } from "./auth-errors";

describe("signInErrorMessage", () => {
  it("asks the user to wait when rate limited", () => {
    expect(signInErrorMessage({ status: 429 })).toMatch(/demasiados intentos/i);
  });

  it("explains that the account is deactivated", () => {
    expect(signInErrorMessage({ status: 403, code: AUTH_ERROR_CODES.ACCOUNT_DISABLED })).toMatch(
      /desactivada/,
    );
  });

  it("tells unverified users that a new link was sent", () => {
    expect(signInErrorMessage({ status: 403, code: AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED })).toMatch(
      /enlace nuevo/,
    );
  });

  it("uses a generic message for wrong credentials", () => {
    expect(signInErrorMessage({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      "Correo o contraseña incorrectos.",
    );
  });
});

describe("verifyEmailErrorMessage", () => {
  it("distinguishes expired links", () => {
    expect(verifyEmailErrorMessage(AUTH_ERROR_CODES.TOKEN_EXPIRED)).toMatch(/caducado/);
  });

  it("treats anything else as an invalid link", () => {
    expect(verifyEmailErrorMessage("INVALID_TOKEN")).toMatch(/no es válido/);
    expect(verifyEmailErrorMessage("whatever")).toMatch(/no es válido/);
  });
});
