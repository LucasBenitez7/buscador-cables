"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [limited, setLimited] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    const form = new FormData(event.currentTarget);
    const { error } = await authClient.requestPasswordReset({
      email: String(form.get("email") ?? ""),
      redirectTo: "/reset-password",
    });

    setPending(false);
    if (error?.status === 429) {
      setLimited(true);
      return;
    }
    // Siempre el mismo mensaje, exista o no el correo: no revelamos cuentas.
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <p role="status" className="text-sm">
          Si el correo está registrado, recibirás un enlace para restablecer la contraseña. El
          enlace caduca en 1 hora.
        </p>
        <Link
          href="/login"
          className="hover:text-primary focus-visible:ring-ring/50 rounded-sm text-sm underline underline-offset-4 transition-colors outline-none focus-visible:ring-3"
        >
          Volver al inicio de sesión
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      {limited ? (
        <p role="alert" className="text-destructive text-sm">
          Has hecho demasiados intentos. Espera unos minutos.
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Enviando…" : "Enviar enlace"}
      </Button>

      <p className="text-center text-sm">
        <Link
          href="/login"
          className="hover:text-primary focus-visible:ring-ring/50 rounded-sm underline underline-offset-4 transition-colors outline-none focus-visible:ring-3"
        >
          Volver al inicio de sesión
        </Link>
      </p>
    </form>
  );
}
