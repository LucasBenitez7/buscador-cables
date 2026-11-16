"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { changeRoleAction, setUserActiveAction, type ActionResult } from "@/features/users/actions";
import type { UserRow } from "@/server/users/service";

/** A role as the pickers show it (fase 12: roles live in the database). */
export type RoleOption = { id: string; name: string; description: string | null };

type Props = {
  users: UserRow[];
  currentUserId: string;
  roles: RoleOption[];
};

/** Etiqueta de cada dato en el móvil, donde la tabla se apila como tarjetas. */
const CELL =
  "flex items-center justify-between gap-3 py-1 before:text-muted-foreground before:content-[attr(data-label)] md:table-cell md:px-4 md:py-3 md:before:content-none";

export function UsersTable({ users, currentUserId, roles }: Props) {
  return (
    <div className="rounded-lg border md:overflow-x-auto">
      <table className="block w-full text-left text-sm md:table">
        <thead className="bg-muted/50 text-muted-foreground hidden text-xs tracking-wide uppercase md:table-header-group">
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
              // La clave incluye el rol: si otro administrador lo cambia y la tabla se
              // revalida, la fila se vuelve a montar con el rol real.
              key={`${user.id}:${user.role}`}
              user={user}
              isSelf={user.id === currentUserId}
              roles={roles}
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
  roles,
}: {
  user: UserRow;
  isSelf: boolean;
  roles: RoleOption[];
}) {
  const [message, setMessage] = useState<ActionResult | null>(null);
  // Controlado: si el servidor rechaza el cambio, el selector vuelve al rol real.
  const [role, setRole] = useState(user.role);
  const [pending, startTransition] = useTransition();
  // Esta página es solo de quien gestiona cuentas (el administrador): gestiona a todos menos
  // a sí mismo. El servidor lo vuelve a comprobar todo.
  const manageable = !isSelf;
  const nameOf = (id: string) => roles.find((item) => item.id === id)?.name ?? user.roleName;
  const chosen = roles.find((item) => item.id === role);
  // Una cuenta nueva: el rol elegido no se guarda hasta aprobarla, y se aprueba con él.
  const approving = manageable && user.pending;

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

  function changeRole(next: string) {
    if (approving) {
      setRole(next);
      return;
    }
    const previous = role;
    setRole(next);
    run(changeRoleAction, { userId: user.id, role: next }, () => setRole(previous));
  }

  return (
    <tr className="hover:bg-muted/40 block border-t p-3 align-top transition-colors first:border-t-0 md:table-row md:p-0 md:first:border-t">
      <td className="block pb-1 text-base font-medium md:table-cell md:px-4 md:py-3 md:text-sm">
        <Link
          href={`/admin/users/${user.id}`}
          className="hover:text-primary focus-visible:ring-ring/50 rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3"
        >
          {user.name}
        </Link>
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
            onChange={(event) => changeRole(event.currentTarget.value)}
            className="w-auto"
          >
            {roles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </NativeSelect>
        ) : (
          user.roleName
        )}
        {user.extras.length > 0 ? (
          <Link
            href={`/admin/users/${user.id}`}
            title={`Permisos extra: ${user.extras.length}`}
            className="bg-primary/15 text-primary ml-2 rounded-full px-2 py-0.5 text-xs font-semibold"
          >
            +{user.extras.length}
            <span className="sr-only"> permisos extra</span>
          </Link>
        ) : null}
        {approving && chosen?.description ? (
          <p className="text-muted-foreground mt-1 max-w-56 text-xs">{chosen.description}</p>
        ) : null}
      </td>
      <td data-label="Estado" className={CELL}>
        <span
          className={
            user.active ? "text-success" : user.pending ? "text-warning" : "text-muted-foreground"
          }
        >
          {user.active ? "Activo" : user.pending ? "Pendiente de aprobación" : "Desactivado"}
        </span>
      </td>
      <td className="block pt-2 md:table-cell md:px-4 md:py-3">
        {approving ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(setUserActiveAction, { userId: user.id, active: "true", role })}
          >
            Aprobar como {nameOf(role)}
          </Button>
        ) : manageable ? (
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
