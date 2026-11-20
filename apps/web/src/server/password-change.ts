import "server-only";
import { isAPIError } from "better-auth/api";
import { notifyPasswordChanged } from "@/server/account-notifications";
import { clearLoginFailures, recordLoginFailure } from "@/server/login-throttle";

/** Better Auth's answer when the current password is wrong. */
const WRONG_PASSWORD = "INVALID_PASSWORD";

type Owner = { name: string; email: string };

/** The person in Better Auth's answer to a password change that worked ({ token, user }). */
export function changedPasswordOwner(returned: unknown): Owner | null {
  if (isAPIError(returned) || !returned || typeof returned !== "object") return null;
  const user = (returned as { user?: unknown }).user;
  if (!user || typeof user !== "object") return null;
  const { name, email } = user as Record<string, unknown>;
  return typeof name === "string" && typeof email === "string" ? { name, email } : null;
}

/**
 * After someone tries to change their password («Mi cuenta», or `/api/auth/change-password`
 * called directly). A wrong current password counts towards the same lock as a wrong sign-in,
 * so the change is no way round it to guess a password; a change that worked clears the count
 * and tells the owner by email: if it was not them, they know at once.
 */
export async function afterPasswordChange(owner: Owner, returned: unknown): Promise<void> {
  if (!isAPIError(returned)) {
    await clearLoginFailures(owner.email);
    await notifyPasswordChanged(owner);
    return;
  }
  if (returned.body?.code === WRONG_PASSWORD) {
    await recordLoginFailure(owner.email);
  }
}
