import { describe, expect, it } from "vitest";
import {
  AUTH_ERROR_CODES,
  signInErrorMessage,
  signUpErrorMessage,
  verifyEmailErrorMessage,
} from "./auth-errors";

describe("signInErrorMessage", () => {
  it("asks the user to wait when rate limited", () => {
    expect(signInErrorMessage({ status: 429 })).toMatch(/demasiados intentos/i);
  });

  it("explains that the account is deactivated", () => {
    expect(signInErrorMessage({ status: 403, code: AUTH_ERROR_CODES.ACCOUNT_DISABLED })).toMatch(
      /desactivada/,
    );
  });

  it("explains that the account waits for an administrator", () => {
    expect(signInErrorMessage({ status: 403, code: AUTH_ERROR_CODES.ACCOUNT_PENDING })).toMatch(
      /pendiente de que un administrador la apruebe/,
    );
  });

  it("explains the per-account lock instead of the generic rate limit", () => {
    expect(signInErrorMessage({ status: 429, code: AUTH_ERROR_CODES.ACCOUNT_LOCKED })).toMatch(
      /intentos fallidos con este correo/,
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

describe("signUpErrorMessage", () => {
  it("asks the user to wait when rate limited", () => {
    expect(signUpErrorMessage({ status: 429 })).toMatch(/demasiados intentos/i);
  });

  it("shows our own validation message", () => {
    expect(
      signUpErrorMessage({
        status: 400,
        code: AUTH_ERROR_CODES.INVALID_PROFILE,
        message: "El nombre debe tener al menos 2 caracteres",
      }),
    ).toBe("El nombre debe tener al menos 2 caracteres");
  });

  // Los mensajes propios de Better Auth vienen en inglés: no se enseñan tal cual.
  it("never shows Better Auth's English messages", () => {
    expect(
      signUpErrorMessage({
        status: 400,
        code: "PASSWORD_TOO_SHORT",
        message: "Password too short",
      }),
    ).toBe("No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.");
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
