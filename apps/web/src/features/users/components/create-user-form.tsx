"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { createUserAction, type ActionResult } from "@/features/users/actions";
import type { RoleOption } from "./users-table";

const EMPTY = { name: "", email: "", role: "VIEWER", password: "" };

export function CreateUserForm({ roles }: { roles: RoleOption[] }) {
  // Con `<form action>` React 19 resetea el formulario al terminar la acción, también
  // si el servidor devuelve un error, y un <select> volvía a su primera opción
  // (Administrador). Se envía con onSubmit y solo se vacía tras un alta correcta.
  const [values, setValues] = useState(EMPTY);
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    async (previous, formData) => {
      const outcome = await createUserAction(previous, formData);
      if (outcome.ok) {
        setValues(EMPTY);
      }
      return outcome;
    },
    null,
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  function field(key: keyof typeof EMPTY) {
    return {
      name: key,
      value: values[key],
      onChange: (event: { target: { value: string } }) =>
        setValues((current) => ({ ...current, [key]: event.target.value })),
    };
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" {...field("name")} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input id="email" type="email" {...field("email")} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="role">Rol</Label>
        <NativeSelect id="role" {...field("role")}>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña temporal</Label>
        <PasswordInput id="password" autoComplete="new-password" {...field("password")} required />
      </div>

      <div className="flex items-center justify-between gap-4 sm:col-span-2">
        <p
          role="status"
          aria-live="polite"
          className={result?.ok ? "text-sm" : "text-destructive text-sm"}
        >
          {result?.message ?? ""}
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear usuario"}
        </Button>
      </div>
    </form>
  );
}
