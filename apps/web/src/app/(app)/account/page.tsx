import type { Metadata } from "next";
import { OwnNameForm, PasswordForm } from "@/features/account/components/account-forms";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Mi cuenta" };
export const dynamic = "force-dynamic";

/**
 * «Mi cuenta», for everybody: their own name and password. The email and the role are only
 * shown: an administrator changes them.
 */
export default async function AccountPage() {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Mi cuenta</h1>
        <p className="text-muted-foreground text-sm">
          {user.email} · {user.roleName}
        </p>
      </div>

      <div className="grid items-start gap-4 md:grid-cols-2">
        <OwnNameForm name={user.name} />
        <PasswordForm />
      </div>
    </div>
  );
}
