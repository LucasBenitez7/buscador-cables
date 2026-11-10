import type { Metadata } from "next";
import Link from "next/link";
import { verifyEmailErrorMessage } from "@/lib/auth-errors";
import { getCurrentUser } from "@/server/session";

export const metadata: Metadata = { title: "Confirmar correo" };

type SearchParams = Promise<{ error?: string }>;

/**
 * Destino del enlace del correo de confirmación. Better Auth verifica el token en
 * `/api/auth/verify-email`, inicia la sesión y redirige aquí; si el enlace no
 * vale, añade `?error=INVALID_TOKEN` o `?error=TOKEN_EXPIRED`.
 */
export default async function VerifyEmailPage({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams;

  if (error) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-destructive text-sm">
          {verifyEmailErrorMessage(error)}
        </p>
        <p className="text-sm">
          Inicia sesión con tu correo y contraseña y te enviaremos un enlace nuevo.
        </p>
        <Link href="/login" className="text-sm underline underline-offset-4">
          Ir al inicio de sesión
        </Link>
      </div>
    );
  }

  const user = await getCurrentUser();

  return (
    <div className="space-y-4">
      <p role="status" className="text-sm">
        Correo confirmado. Tu cuenta ya está activa.
      </p>
      <Link href={user ? "/" : "/login"} className="text-sm underline underline-offset-4">
        {user ? "Entrar en la aplicación" : "Iniciar sesión"}
      </Link>
    </div>
  );
}
