"use client";

import Link from "next/link";
import { TEXT_LINK } from "@/components/ui/text-link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { signInErrorMessage } from "@/lib/auth-errors";

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const { error: signInError } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      rememberMe: true,
      // Sin `callbackURL`: Better Auth redirigiría ahí tras un login correcto e
      // ignoraría `next`. El enlace que reenvía a cuentas sin confirmar lleva a "/".
    });

    setPending(false);

    if (signInError) {
      setError(signInErrorMessage(signInError));
      return;
    }

    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {notice ? (
        <p role="status" className="bg-muted rounded-md px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Entrando…" : "Iniciar sesión"}
      </Button>

      <p className="text-center text-sm">
        <Link href="/forgot-password" className={TEXT_LINK}>
          He olvidado mi contraseña
        </Link>
      </p>

      <p className="text-center text-sm">
        ¿No tienes cuenta?{" "}
        <Link href="/register" className={TEXT_LINK}>
          Crear cuenta
        </Link>
      </p>
    </form>
  );
}
