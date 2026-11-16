import "server-only";
import { prisma, type UserEventAction } from "@cables/db";
import type { Role } from "@cables/shared";
import {
  accountCreatedEmail,
  accountDeactivatedEmail,
  accountReactivatedEmail,
  newAdminEmail,
  passwordChangedEmail,
  pendingApprovalEmail,
  roleChangedEmail,
  welcomeEmail,
} from "@/lib/email-templates";
import { env } from "@/lib/env";
import { sendEmail } from "@/server/email";

/**
 * Who learns what about the accounts, by email. The whole list, with the reasons, is in
 * docs/ARQUITECTURA.md ("Correos y avisos"):
 * - the person, about everything that happens to their own account;
 * - the active administrators, about accounts waiting for approval and new administrators.
 * Field work on the cables never sends email: it is in the activity and the history.
 *
 * Sending never fails the change: `sendEmail` logs the error and goes on.
 */

const appUrl = (path: string) => new URL(path, env.APP_URL).toString();

/** A change to an account, as the users service reports it. */
export type AccountChange = {
  action: UserEventAction;
  user: { id: string; name: string; email: string };
  fromRole?: Role | null;
  toRole?: Role | null;
};

async function activeAdmins(except: readonly string[] = []) {
  return prisma.user.findMany({
    where: { role: "ADMIN", active: true, id: { notIn: [...except] } },
    select: { email: true },
  });
}

/**
 * Tells every active administrator that a self-registered account confirmed its email and
 * waits for approval. Does nothing for accounts already approved (an administrator may
 * approve before the user opens the confirmation link).
 */
export async function notifyAdminsOfPendingAccount(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, approvedAt: true, createdAt: true },
  });
  if (!user || user.approvedAt !== null) {
    return;
  }
  const [admins, pendingCount] = await Promise.all([
    activeAdmins(),
    prisma.user.count({ where: { active: false, approvedAt: null } }),
  ]);
  await Promise.all(
    admins.map((admin) =>
      sendEmail(
        pendingApprovalEmail({
          to: admin.email,
          applicantName: user.name,
          applicantEmail: user.email,
          registeredAt: user.createdAt,
          pendingCount,
          usersUrl: appUrl("/admin/users"),
        }),
      ),
    ),
  );
}

/** After a password reset: the owner learns it, in case it was not them. */
export async function notifyPasswordChanged(user: { name: string; email: string }) {
  await sendEmail(
    passwordChangedEmail({
      to: user.email,
      name: user.name,
      changedAt: new Date(),
      forgotPasswordUrl: appUrl("/forgot-password"),
    }),
  );
}

/** Emails for a change an administrator made to an account. */
export async function notifyAccountChange(
  change: AccountChange,
  actor: { id: string; name: string },
): Promise<void> {
  const { user } = change;
  const loginUrl = appUrl("/login");
  const emails = [];
  switch (change.action) {
    case "CREATED":
      emails.push(
        accountCreatedEmail({
          to: user.email,
          name: user.name,
          role: change.toRole!,
          createdBy: actor.name,
          loginUrl,
          forgotPasswordUrl: appUrl("/forgot-password"),
        }),
      );
      break;
    case "APPROVED":
      emails.push(
        welcomeEmail({ to: user.email, name: user.name, role: change.toRole!, loginUrl }),
      );
      break;
    case "ROLE_CHANGED":
      emails.push(
        roleChangedEmail({
          to: user.email,
          name: user.name,
          fromRole: change.fromRole!,
          toRole: change.toRole!,
          changedBy: actor.name,
          loginUrl,
        }),
      );
      break;
    case "DEACTIVATED":
      emails.push(accountDeactivatedEmail({ to: user.email, name: user.name }));
      break;
    case "REACTIVATED":
      emails.push(accountReactivatedEmail({ to: user.email, name: user.name, loginUrl }));
      break;
  }
  // Un administrador nuevo lo saben los demás: puede gestionar a cualquiera.
  if (change.toRole === "ADMIN" && change.action !== "DEACTIVATED") {
    for (const admin of await activeAdmins([user.id, actor.id])) {
      emails.push(
        newAdminEmail({
          to: admin.email,
          adminName: user.name,
          adminEmail: user.email,
          grantedBy: actor.name,
          usersUrl: appUrl("/admin/users"),
        }),
      );
    }
  }
  await Promise.all(emails.map((message) => sendEmail(message)));
}
