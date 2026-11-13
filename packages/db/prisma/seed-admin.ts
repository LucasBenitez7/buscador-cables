/**
 * Checks on the credentials of the first administrator (`SEED_ADMIN_*` in `.env`) before
 * the seed creates the account.
 */

/** The same minimum as the app (`PASSWORD_MIN_LENGTH` in @cables/shared). */
export const SEED_PASSWORD_MIN_LENGTH = 10;

/**
 * The values of `.env.example`. The repository is public, so everybody knows them: fine on
 * a developer's machine, an open door in production.
 */
export const EXAMPLE_ADMIN = {
  email: "admin@cables.local",
  password: "CambiaEstaClave1!",
} as const;

/** Why these credentials cannot be used, in Spanish, or null when they can. */
export function seedAdminProblem(input: {
  email: string;
  password: string;
  production: boolean;
}): string | null {
  if (input.password.length < SEED_PASSWORD_MIN_LENGTH) {
    return `SEED_ADMIN_PASSWORD debe tener al menos ${SEED_PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (!input.production) {
    return null;
  }
  if (input.password === EXAMPLE_ADMIN.password) {
    return "SEED_ADMIN_PASSWORD es la contraseña de ejemplo de .env.example, que es pública: pon una propia antes de crear el administrador en producción.";
  }
  if (input.email === EXAMPLE_ADMIN.email) {
    return "SEED_ADMIN_EMAIL es el correo de ejemplo de .env.example: pon el correo real del administrador, que es quien recibe los avisos de cuentas pendientes.";
  }
  return null;
}
