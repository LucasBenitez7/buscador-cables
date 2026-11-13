/** Error codes returned to the client by our own Better Auth hooks. */
export const AUTH_ERROR_CODES = {
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
  ACCOUNT_PENDING: "ACCOUNT_PENDING",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  INVALID_PROFILE: "INVALID_PROFILE",
  PROFILE_LOCKED: "PROFILE_LOCKED",
  // Códigos propios de Better Auth que tratamos de forma específica.
  EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED",
  INVALID_TOKEN: "INVALID_TOKEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
} as const;

export type SignInError = { status: number; code?: string | undefined };

/** Spanish message for a failed sign-in. */
export function signInErrorMessage(error: SignInError): string {
  if (error.code === AUTH_ERROR_CODES.ACCOUNT_LOCKED) {
    return "Demasiados intentos fallidos con este correo. Espera 15 minutos o restablece la contraseña.";
  }
  if (error.status === 429) {
    return "Demasiados intentos. Espera un minuto e inténtalo de nuevo.";
  }
  if (error.code === AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED) {
    return "Tu correo aún no está confirmado. Te hemos enviado un enlace nuevo.";
  }
  if (error.code === AUTH_ERROR_CODES.ACCOUNT_PENDING) {
    return "Tu cuenta está pendiente de que un administrador la apruebe. Te avisaremos por correo.";
  }
  if (error.code === AUTH_ERROR_CODES.ACCOUNT_DISABLED) {
    return "Tu cuenta está desactivada. Contacta con un administrador.";
  }
  return "Correo o contraseña incorrectos.";
}

/** Spanish message for the `?error=` that Better Auth appends to the verification link. */
export function verifyEmailErrorMessage(code: string): string {
  if (code === AUTH_ERROR_CODES.TOKEN_EXPIRED) {
    return "El enlace de confirmación ha caducado.";
  }
  return "El enlace de confirmación no es válido.";
}

/** Spanish message for a failed sign-up: Better Auth's own messages are in English. */
export function signUpErrorMessage(error: SignInError & { message?: string | undefined }): string {
  if (error.status === 429) {
    return "Demasiados intentos. Espera un minuto e inténtalo de nuevo.";
  }
  // El mensaje de INVALID_PROFILE es nuestro (Zod, en español); el resto vienen en inglés.
  if (error.code === AUTH_ERROR_CODES.INVALID_PROFILE && error.message) {
    return error.message;
  }
  return "No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.";
}
