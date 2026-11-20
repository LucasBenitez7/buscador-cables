"use client";

import { startTransition, useActionState, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  changeOwnNameAction,
  changePasswordAction,
  type ActionResult,
} from "@/features/account/actions";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="bg-card space-y-4 rounded-lg border p-4">
      <h2 className="text-base font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Outcome({ result }: { result: ActionResult | null }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className={result?.ok ? "text-success text-sm" : "text-destructive text-sm"}
    >
      {result?.message ?? ""}
    </p>
  );
}

/** Sends with onSubmit (React 19 empties a `<form action>` even when the server says no). */
function submitWith(formAction: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  };
}

export function OwnNameForm({ name }: { name: string }) {
  const [value, setValue] = useState(name);
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    changeOwnNameAction,
    null,
  );

  return (
    <Card title="Nombre">
      <form onSubmit={submitWith(formAction)} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="name">Nombre y apellidos</Label>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required
          />
        </div>
        <Outcome result={result} />
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar nombre"}
        </Button>
      </form>
    </Card>
  );
}

const NO_PASSWORDS = { currentPassword: "", newPassword: "", confirmPassword: "" };

export function PasswordForm() {
  const [values, setValues] = useState(NO_PASSWORDS);
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      const outcome = await changePasswordAction(previous, formData);
      if (outcome.ok) setValues(NO_PASSWORDS);
      return outcome;
    },
    null,
  );

  function field(key: keyof typeof NO_PASSWORDS) {
    return {
      id: key,
      name: key,
      value: values[key],
      onChange: (event: { target: { value: string } }) =>
        setValues((current) => ({ ...current, [key]: event.target.value })),
      required: true,
    };
  }

  return (
    <Card title="Contraseña">
      <form onSubmit={submitWith(formAction)} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="currentPassword">Contraseña actual</Label>
          <PasswordInput autoComplete="current-password" {...field("currentPassword")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPassword">Nueva contraseña</Label>
          <PasswordInput autoComplete="new-password" {...field("newPassword")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Repite la nueva</Label>
          <PasswordInput autoComplete="new-password" {...field("confirmPassword")} />
        </div>
        <Outcome result={result} />
        <Button type="submit" disabled={pending}>
          {pending ? "Cambiando…" : "Cambiar contraseña"}
        </Button>
      </form>
    </Card>
  );
}
