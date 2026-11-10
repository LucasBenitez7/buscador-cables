import type { Metadata } from "next";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

export const metadata: Metadata = { title: "Nueva contraseña" };

type SearchParams = Promise<{ token?: string; error?: string }>;

export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  // Better Auth redirige aquí con ?error=INVALID_TOKEN cuando el enlace no vale.
  const invalidLink = params.error === "INVALID_TOKEN";

  return <ResetPasswordForm token={params.token} invalidLink={invalidLink} />;
}
