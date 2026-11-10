import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/components/login-form";
import { safeNextPath } from "@/lib/route-access";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "Iniciar sesión" };

type SearchParams = Promise<{ next?: string; reset?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  // Validación real contra la base de datos (el proxy solo ve la cookie).
  if (await getCurrentUser()) {
    redirect(next);
  }

  return (
    <LoginForm
      next={next}
      notice={params.reset === "ok" ? "Contraseña actualizada. Ya puedes entrar." : undefined}
    />
  );
}
