import "server-only";
import { prisma } from "@cables/db";
import { accountApprovedEmail, pendingApprovalEmail } from "@/lib/email-templates";
import { env } from "@/lib/env";
import { sendEmail } from "@/server/email";

/**
 * Tells every active administrator that a self-registered account confirmed its email and
 * waits for approval. Does nothing for accounts already approved (an administrator may
 * approve before the user opens the confirmation link).
 */
export async function notifyAdminsOfPendingAccount(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, approvedAt: true },
  });
  if (!user || user.approvedAt !== null) {
    return;
  }
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { email: true },
  });
  const usersUrl = new URL("/admin/users", env.APP_URL).toString();
  await Promise.all(
    admins.map((admin) =>
      sendEmail(
        pendingApprovalEmail({
          to: admin.email,
          applicantName: user.name,
          applicantEmail: user.email,
          usersUrl,
        }),
      ),
    ),
  );
}

/** Tells a user that their account has just been approved. */
export async function notifyAccountApproved(user: { name: string; email: string }): Promise<void> {
  await sendEmail(
    accountApprovedEmail({
      to: user.email,
      name: user.name,
      loginUrl: new URL("/login", env.APP_URL).toString(),
    }),
  );
}
