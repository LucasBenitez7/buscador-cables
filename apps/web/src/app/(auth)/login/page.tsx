import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/components/login-form";
import { safeNextPath } from "@/lib/route-access";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "Iniciar sesión" };

type SearchParams = Promise<{ next?: string; reset?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  if (await getCurrentUser()) {
    redirect("/");
  }

  return (
    <LoginForm
      next={safeNextPath(params.next)}
      notice={params.reset === "ok" ? "Contraseña actualizada. Ya puedes entrar." : undefined}
    />
  );
}
