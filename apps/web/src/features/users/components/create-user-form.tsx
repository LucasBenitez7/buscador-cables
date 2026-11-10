"use client";

import { useActionState } from "react";
import { ROLES, ROLE_LABELS, canManageActor, type Role } from "@cables/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createUserAction, type ActionResult } from "@/features/users/actions";

export function CreateUserForm({ currentRole }: { currentRole: Role }) {
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(
    createUserAction,
    null,
  );

  const assignable = ROLES.filter((role) => canManageActor(currentRole, role));

  return (
    <form action={formAction} className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="role">Rol</Label>
        <select
          id="role"
          name="role"
          defaultValue="VIEWER"
          className="border-input bg-background h-8 w-full rounded-lg border px-2.5 text-sm"
        >
          {assignable.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña temporal</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
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
