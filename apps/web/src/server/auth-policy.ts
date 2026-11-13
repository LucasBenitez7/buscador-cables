import "server-only";
import { prisma } from "@cables/db";
import { signUpProfileSchema } from "@cables/shared";
import { APIError } from "better-auth/api";
import { AUTH_ERROR_CODES } from "@/lib/auth-errors";

/**
 * Refuses to open a session for an account that is not active: one that an administrator
 * deactivated, one still waiting for approval, or one that no longer exists.
 *
 * Better Auth knows nothing about our `active` flag, so without this check a
 * deactivated user could sign in again with their password. It runs from the
 * `databaseHooks.session.create.before` hook, i.e. only after the password has
 * been verified, so it does not reveal whether an email exists.
 */
export async function assertAccountActive(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { active: true, approvedAt: true },
  });

  if (user?.active) {
    return;
  }
  if (user && user.approvedAt === null) {
    throw APIError.from("FORBIDDEN", {
      code: AUTH_ERROR_CODES.ACCOUNT_PENDING,
      message: "La cuenta está pendiente de aprobación.",
    });
  }
  throw APIError.from("FORBIDDEN", {
    code: AUTH_ERROR_CODES.ACCOUNT_DISABLED,
    message: "La cuenta está desactivada.",
  });
}

type NewAuthUser = { name: string; email: string } & Record<string, unknown>;

/**
 * Validates and normalizes a self-registered user before Better Auth stores it.
 *
 * Better Auth only checks the email format and the password length, so the
 * name is validated here with the shared Zod schema. Role and status are forced
 * on the server: a new account is always a VIEWER that cannot sign in until an
 * administrator approves it, because the app holds the client's real data.
 * (Admin-created users are written with Prisma and skip this hook.)
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
    data: { ...user, ...parsed.data, role: "VIEWER", active: false },
  };
}

/** Profile fields a user could change through Better Auth's `/update-user` endpoint. */
const SELF_EDITABLE_PROFILE_FIELDS = ["name", "image", "email"] as const;

/**
 * Refuses profile changes made through Better Auth (`POST /api/auth/update-user`).
 *
 * The history shows the *current* name of whoever did each thing, so a user who renamed
 * themselves would sign every movement, past and future, as somebody else. The app has no
 * profile screen: names are set at sign-up and by administrators. Better Auth's own updates
 * (confirming the email, for example) carry none of these fields and go through.
 */
export function assertNoProfileSelfEdit(data: Record<string, unknown>): void {
  if (SELF_EDITABLE_PROFILE_FIELDS.some((field) => data[field] !== undefined)) {
    throw APIError.from("FORBIDDEN", {
      code: AUTH_ERROR_CODES.PROFILE_LOCKED,
      message: "El nombre y el correo solo los cambia un administrador.",
    });
  }
}
