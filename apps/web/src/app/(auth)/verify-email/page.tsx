import type { Metadata } from "next";
import Link from "next/link";
import { verifyEmailErrorMessage } from "@/lib/auth-errors";

export const metadata: Metadata = { title: "Confirmar correo" };

type SearchParams = Promise<{ error?: string }>;

const LINK_CLASS =
  "hover:text-primary focus-visible:ring-ring/50 rounded-sm text-sm underline underline-offset-4 transition-colors outline-none focus-visible:ring-3";

/**
 * Destino del enlace del correo de confirmación. Better Auth verifica el token en
 * `/api/auth/verify-email` y redirige aquí; si el enlace no vale, añade
 * `?error=INVALID_TOKEN` o `?error=TOKEN_EXPIRED`. No inicia sesión: la cuenta nueva tiene
 * que aprobarla un administrador.
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
        <Link href="/login" className={LINK_CLASS}>
          Ir al inicio de sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p role="status" className="text-sm">
        Correo confirmado. Ahora un administrador tiene que aprobar tu cuenta: te avisaremos por
        correo cuando puedas entrar.
      </p>
      <p className="text-muted-foreground text-sm">
        Si ya la han aprobado, puedes iniciar sesión con tu correo y tu contraseña.
      </p>
      <Link href="/login" className={LINK_CLASS}>
        Ir al inicio de sesión
      </Link>
    </div>
  );
}
