import "server-only";
import { prisma } from "@cables/db";
import { signUpProfileSchema } from "@cables/shared";
import { APIError } from "better-auth/api";
import { AUTH_ERROR_CODES } from "@/lib/auth-errors";

/**
 * Refuses to open a session for a deactivated (or missing) account.
 *
 * Better Auth knows nothing about our `active` flag, so without this check a
 * deactivated user could sign in again with their password. It runs from the
 * `databaseHooks.session.create.before` hook, i.e. only after the password has
 * been verified, so it does not reveal whether an email exists.
 */
export async function assertAccountActive(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { active: true },
  });

  if (!user?.active) {
    throw APIError.from("FORBIDDEN", {
      code: AUTH_ERROR_CODES.ACCOUNT_DISABLED,
      message: "La cuenta está desactivada.",
    });
  }
}

type NewAuthUser = { name: string; email: string } & Record<string, unknown>;

/**
 * Validates and normalizes a self-registered user before Better Auth stores it.
 *
 * Better Auth only checks the email format and the password length, so the
 * name is validated here with the shared Zod schema. Role and status are forced
 * on the server: a new account is always an active VIEWER until an admin
 * promotes it. (Admin-created users are written with Prisma and skip this hook.)
 */
export function prepareSignUpUser<T extends NewAuthUser>(user: T): { data: T } {
  const parsed = signUpProfileSchema.safeParse({ name: user.name, email: user.email });
  if (!parsed.success) {
    throw APIError.from("BAD_REQUEST", {
      code: AUTH_ERROR_CODES.INVALID_PROFILE,
      message: parsed.error.issues[0]?.message ?? "Datos no válidos.",
    });
  }

  return {
    data: { ...user, ...parsed.data, role: "VIEWER", active: true },
  };
}
