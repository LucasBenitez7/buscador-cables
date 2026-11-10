"use client";

import { useState, useTransition } from "react";
import { ROLES, ROLE_LABELS, canManageActor, type Role } from "@cables/shared";
import { Button } from "@/components/ui/button";
import { changeRoleAction, setUserActiveAction, type ActionResult } from "@/features/users/actions";
import type { UserRow } from "@/server/users/service";

type Props = {
  users: UserRow[];
  currentUserId: string;
  currentRole: Role;
};

export function UsersTable({ users, currentUserId, currentRole }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Nombre</th>
            <th className="px-4 py-2 font-medium">Correo</th>
            <th className="px-4 py-2 font-medium">Rol</th>
            <th className="px-4 py-2 font-medium">Estado</th>
            <th className="px-4 py-2 font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
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
  const [pending, startTransition] = useTransition();
  const manageable = !isSelf && canManageActor(currentRole, user.role);
  const assignable = ROLES.filter((role) => canManageActor(currentRole, role));

  function run(
    action: (formData: FormData) => Promise<ActionResult>,
    fields: Record<string, string>,
  ) {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      formData.set(key, value);
    }
    startTransition(async () => {
      setMessage(await action(formData));
    });
  }

  return (
    <tr className="border-t align-top">
      <td className="px-4 py-3 font-medium">
        {user.name}
        {isSelf ? <span className="text-muted-foreground ml-2 text-xs">(tú)</span> : null}
      </td>
      <td className="px-4 py-3">{user.email}</td>
      <td className="px-4 py-3">
        {manageable ? (
          <select
            aria-label={`Rol de ${user.name}`}
            defaultValue={user.role}
            disabled={pending}
            onChange={(event) =>
              run(changeRoleAction, { userId: user.id, role: event.currentTarget.value })
            }
            className="border-input bg-background h-8 rounded-lg border px-2 text-sm"
          >
            {assignable.includes(user.role) ? null : (
              <option value={user.role}>{ROLE_LABELS[user.role]}</option>
            )}
            {assignable.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        ) : (
          ROLE_LABELS[user.role]
        )}
      </td>
      <td className="px-4 py-3">
        <span className={user.active ? "text-emerald-600" : "text-muted-foreground"}>
          {user.active ? "Activo" : "Desactivado"}
        </span>
      </td>
      <td className="px-4 py-3">
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
