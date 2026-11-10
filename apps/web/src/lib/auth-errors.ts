/** Error codes returned to the client by our own Better Auth hooks. */
export const AUTH_ERROR_CODES = {
  ACCOUNT_DISABLED: "ACCOUNT_DISABLED",
} as const;

export type SignInError = { status: number; code?: string | undefined };

/** Spanish message for a failed sign-in. */
export function signInErrorMessage(error: SignInError): string {
  if (error.status === 429) {
    return "Demasiados intentos. Espera un minuto e inténtalo de nuevo.";
  }
  if (error.code === AUTH_ERROR_CODES.ACCOUNT_DISABLED) {
    return "Tu cuenta está desactivada. Contacta con un administrador.";
  }
  return "Correo o contraseña incorrectos.";
}
