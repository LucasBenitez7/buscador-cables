"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PASSWORD_MIN_LENGTH } from "@cables/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({
  token,
  invalidLink,
}: {
  token?: string;
  invalidLink: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (invalidLink || !token) {
    return (
      <div className="space-y-4">
        <p role="alert" className="text-destructive text-sm">
          El enlace no es válido o ha caducado. Pide uno nuevo.
        </p>
        <Link
          href="/forgot-password"
          className="hover:text-primary focus-visible:ring-ring/50 rounded-sm text-sm underline underline-offset-4 transition-colors outline-none focus-visible:ring-3"
        >
          Solicitar un enlace nuevo
        </Link>
      </div>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setPending(true);
    const { error: resetError } = await authClient.resetPassword({
      newPassword: password,
      token: token as string,
    });
    setPending(false);

    if (resetError) {
      setError("No se pudo cambiar la contraseña. El enlace puede haber caducado.");
      return;
    }

    router.replace("/login?reset=ok");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="password">Nueva contraseña</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">Repite la contraseña</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Guardando…" : "Guardar contraseña"}
      </Button>
    </form>
  );
}
