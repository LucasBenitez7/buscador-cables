"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import type { Permission } from "@cables/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createRoleAction, deleteRoleAction, updateRoleAction } from "@/features/roles/actions";
import { PermissionPicker } from "./permission-picker";

type Props = {
  /** Without `id`, a new role (maybe copied from another one). */
  role: {
    id?: string;
    version?: number;
    name: string;
    description: string | null;
    permissions: Permission[];
    locked?: boolean;
    system?: boolean;
    users?: number;
  };
};

/**
 * Name, description and permissions of a role. The administrator role is shown but cannot be
 * changed; a starting role cannot be deleted, nor a role somebody has.
 */
export function RoleEditor({ role }: Props) {
  const router = useRouter();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");
  const [permissions, setPermissions] = useState<Permission[]>(role.permissions);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const locked = Boolean(role.locked);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const payload = { name, description, permissions };
      const response = role.id
        ? await updateRoleAction({ ...payload, id: role.id, version: role.version })
        : await createRoleAction(payload);
      setResult(response);
      if (response.ok && response.id) {
        router.push(`/admin/roles/${response.id}`);
        router.refresh();
      }
    });
  }

  function remove() {
    if (!role.id || !window.confirm(`¿Borrar el rol «${role.name}»? No se puede deshacer.`)) return;
    startTransition(async () => {
      const response = await deleteRoleAction({ id: role.id, version: role.version });
      setResult(response);
      if (response.ok) {
        router.push("/admin/roles");
        router.refresh();
      }
    });
  }

  const canDelete = Boolean(role.id) && !role.system && !locked;

  return (
    <form onSubmit={submit} className="space-y-5">
      {locked ? (
        <p
          role="note"
          className="border-warning/50 bg-warning/10 rounded-lg border px-3 py-2 text-sm"
        >
          El rol Administrador no se puede cambiar: es el único que gestiona cuentas y roles, y
          siempre tiene todos los permisos.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="role-name">Nombre</Label>
          <Input
            id="role-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            required
            disabled={locked}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="role-description">Para quién es (opcional)</Label>
          <Textarea
            id="role-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={300}
            rows={2}
            disabled={locked}
            placeholder="Conexionistas: conectan y timbran, no tienden."
          />
        </div>
      </div>

      <PermissionPicker
        value={permissions}
        onChange={setPermissions}
        disabled={locked}
        showProtected={locked}
      />

      {result ? (
        <p
          role={result.ok ? "status" : "alert"}
          className={result.ok ? "text-success text-sm" : "text-destructive text-sm"}
        >
          {result.message}
        </p>
      ) : null}

      {locked ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : role.id ? "Guardar cambios" : "Crear rol"}
          </Button>
          {canDelete ? (
            <Button
              type="button"
              variant="destructive"
              disabled={pending || (role.users ?? 0) > 0}
              title={
                (role.users ?? 0) > 0
                  ? "Cambia antes el rol de las personas que lo tienen"
                  : undefined
              }
              onClick={remove}
            >
              Borrar rol
            </Button>
          ) : null}
          {canDelete && (role.users ?? 0) > 0 ? (
            <span className="text-muted-foreground text-xs">
              Para borrarlo, cambia antes el rol de las personas que lo tienen.
            </span>
          ) : null}
        </div>
      )}
    </form>
  );
}
