"use client";

import { useState, useTransition } from "react";
import { ROLES, ROLE_LABELS, canManageActor, isRole, type Role } from "@cables/shared";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { changeRoleAction, setUserActiveAction, type ActionResult } from "@/features/users/actions";
import type { UserRow } from "@/server/users/service";

type Props = {
  users: UserRow[];
  currentUserId: string;
  currentRole: Role;
};

/** Etiqueta de cada dato en el móvil, donde la tabla se apila como tarjetas. */
const CELL =
  "flex items-center justify-between gap-3 py-1 before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:px-4 md:py-3 md:before:content-none";

export function UsersTable({ users, currentUserId, currentRole }: Props) {
  return (
    <div className="rounded-lg border md:overflow-x-auto">
      <table className="block w-full text-left text-sm md:table">
        <thead className="bg-muted/50 text-muted-foreground hidden md:table-header-group">
          <tr>
            <th className="px-4 py-2 font-medium">Nombre</th>
            <th className="px-4 py-2 font-medium">Correo</th>
            <th className="px-4 py-2 font-medium">Rol</th>
            <th className="px-4 py-2 font-medium">Estado</th>
            <th className="px-4 py-2 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody className="block md:table-row-group">
          {users.map((user) => (
            <UserRowView
              key={user.id}
              user={user}
              isSelf={user.id === currentUserId}
              currentRole={currentRole}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserRowView({
  user,
  isSelf,
  currentRole,
}: {
  user: UserRow;
  isSelf: boolean;
  currentRole: Role;
}) {
  const [message, setMessage] = useState<ActionResult | null>(null);
  // Controlado: si el servidor rechaza el cambio, el selector vuelve al rol real.
  const [role, setRole] = useState<Role>(user.role);
  const [pending, startTransition] = useTransition();
  const manageable = !isSelf && canManageActor(currentRole, user.role);
  const assignable = ROLES.filter((role) => canManageActor(currentRole, role));

  function run(
    action: (formData: FormData) => Promise<ActionResult>,
    fields: Record<string, string>,
    onFailure?: () => void,
  ) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      formData.set(key, value);
    }
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        onFailure?.();
      }
      setMessage(result);
    });
  }

  function changeRole(next: Role) {
    const previous = role;
    setRole(next);
    run(changeRoleAction, { userId: user.id, role: next }, () => setRole(previous));
  }

  return (
    <tr className="hover:bg-muted/40 block border-t p-3 align-top transition-colors first:border-t-0 md:table-row md:p-0 md:first:border-t">
      <td className="block pb-1 text-base font-medium md:table-cell md:px-4 md:py-3 md:text-sm">
        {user.name}
        {isSelf ? <span className="text-muted-foreground ml-2 text-xs">(tú)</span> : null}
      </td>
      <td data-label="Correo" className={`${CELL} break-all`}>
        {user.email}
      </td>
      <td data-label="Rol" className={CELL}>
        {manageable ? (
          <NativeSelect
            aria-label={`Rol de ${user.name}`}
            value={role}
            disabled={pending}
            onChange={(event) => {
              const next = event.currentTarget.value;
              if (isRole(next)) {
                changeRole(next);
              }
            }}
            className="w-auto"
          >
            {assignable.includes(user.role) ? null : (
              <option value={user.role}>{ROLE_LABELS[user.role]}</option>
            )}
            {assignable.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </NativeSelect>
        ) : (
          ROLE_LABELS[user.role]
        )}
      </td>
      <td data-label="Estado" className={CELL}>
        <span className={user.active ? "text-success" : "text-muted-foreground"}>
          {user.active ? "Activo" : "Desactivado"}
        </span>
      </td>
      <td className="block pt-2 md:table-cell md:px-4 md:py-3">
        {manageable ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              run(setUserActiveAction, { userId: user.id, active: String(!user.active) })
            }
          >
            {user.active ? "Desactivar" : "Reactivar"}
          </Button>
        ) : null}
        {message ? (
          <p
            role="status"
            className={message.ok ? "mt-2 text-xs" : "text-destructive mt-2 text-xs"}
          >
            {message.message}
          </p>
        ) : null}
      </td>
    </tr>
  );
}
