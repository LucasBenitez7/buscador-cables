import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RegisterForm } from "@/features/auth/components/register-form";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function RegisterPage() {
  if (await getCurrentUser()) {
    redirect("/");
  }

  return <RegisterForm />;
}
