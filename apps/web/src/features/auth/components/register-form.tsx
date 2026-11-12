"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { signUpSchema } from "@cables/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { VERIFY_EMAIL_PATH } from "@/lib/route-access";

export function RegisterForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const parsed = signUpSchema.safeParse({
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      confirmPassword: String(form.get("confirmPassword") ?? ""),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los datos.");
      return;
    }

    setPending(true);
    const { error: signUpError } = await authClient.signUp.email({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      callbackURL: VERIFY_EMAIL_PATH,
    });
    setPending(false);

    if (signUpError) {
      setError(
        signUpError.status === 429
          ? "Demasiados intentos. Espera un minuto e inténtalo de nuevo."
          : (signUpError.message ?? "No se pudo crear la cuenta. Inténtalo de nuevo."),
      );
      return;
    }

    // Misma respuesta exista o no el correo: no revelamos cuentas.
    setSentTo(parsed.data.email);
  }

  if (sentTo) {
    return (
      <div className="space-y-4">
        <p role="status" className="text-sm">
          Te hemos enviado un correo a <strong>{sentTo}</strong> para confirmar la cuenta. El enlace
          caduca en 24 horas.
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
        <Label htmlFor="name">Nombre y apellidos</Label>
        <Input id="name" name="name" autoComplete="name" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Repite la contraseña</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creando cuenta…" : "Crear cuenta"}
      </Button>

      <p className="text-muted-foreground text-center text-xs">
        Las cuentas nuevas tienen acceso de solo consulta. Un administrador puede ampliar tus
        permisos.
      </p>

      <p className="text-center text-sm">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/login"
          className="hover:text-primary focus-visible:ring-ring/50 rounded-sm underline underline-offset-4 transition-colors outline-none focus-visible:ring-3"
        >
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}
