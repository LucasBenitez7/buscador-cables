import "server-only";
import { prisma } from "@cables/db";
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
