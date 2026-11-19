"use client";

import { CheckIcon, MinusIcon } from "lucide-react";
import { useId, useState } from "react";
import { PERMISSION_GROUPS, type Permission } from "@cables/shared";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "cn";

const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((group) => group.permissions);

type CompareRole = { id: string; name: string; permissions: readonly string[] };

/**
 * Roles side by side (fase 16). On a computer, a table: the permissions in rows, by group,
 * and the roles in columns. On a phone, two roles face to face, with the permissions where
 * they differ marked. «Solo diferencias» hides the rows where they all agree.
 */
export function RolesCompare({ roles }: { roles: CompareRole[] }) {
  const id = useId();
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [left, setLeft] = useState(roles[0]?.id ?? "");
  const [right, setRight] = useState(roles[1]?.id ?? roles[0]?.id ?? "");

  const has = (role: CompareRole, permission: Permission) => role.permissions.includes(permission);
  const differs = (shown: CompareRole[], permission: Permission) =>
    new Set(shown.map((role) => has(role, permission))).size > 1;

  const pair = [left, right].map((roleId) => roles.find((role) => role.id === roleId)!);
  // Una sola lista, sin títulos de sección (decidido el 2026-11-19), en el orden de siempre.
  const rowsFor = (shown: CompareRole[]) =>
    ALL_PERMISSIONS.filter((permission) => !onlyDifferences || differs(shown, permission.id));

  const tableRows = rowsFor(roles);
  const pairRows = rowsFor(pair);

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">
          Comparar roles
        </h2>
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyDifferences}
            onChange={(event) => setOnlyDifferences(event.target.checked)}
            className="accent-primary size-4"
          />
          Solo diferencias
        </label>
      </div>

      {/* Ordenador: todos los roles en columnas. */}
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-xs tracking-wide uppercase">
            <tr>
              <th scope="col" className="bg-muted sticky left-0 px-3 py-2 font-medium">
                Permiso
              </th>
              {roles.map((role) => (
                <th key={role.id} scope="col" className="px-3 py-2 text-center font-medium">
                  {role.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((permission) => (
              <tr key={permission.id} className="border-t">
                <th scope="row" className="bg-card sticky left-0 px-3 py-2 font-normal">
                  {permission.label}
                </th>
                {roles.map((role) => (
                  <td key={role.id} className="px-3 py-2 text-center">
                    <Mark yes={has(role, permission.id)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {tableRows.length === 0 ? <Same /> : null}
      </div>

      {/* Móvil: dos roles frente a frente. */}
      <div className="space-y-3 md:hidden">
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: left, set: setLeft, label: "Rol" },
            { value: right, set: setRight, label: "Frente a" },
          ].map((side, index) => (
            <div key={index} className="min-w-0 space-y-1.5">
              <Label htmlFor={`${id}-side-${index}`}>{side.label}</Label>
              <NativeSelect
                id={`${id}-side-${index}`}
                value={side.value}
                onChange={(event) => side.set(event.target.value)}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ))}
        </div>
        {pairRows.length === 0 ? (
          <Same />
        ) : (
          <div className="bg-card divide-y rounded-lg border text-sm">
            {/* Encima de cada columna, su rol. */}
            <div
              aria-hidden
              className="text-muted-foreground grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] gap-2 border-l-2 border-transparent px-3 py-2 text-xs font-medium"
            >
              <span />
              {pair.map((role, index) => (
                <span key={index} className="truncate text-center">
                  {role.name}
                </span>
              ))}
            </div>
            <ul className="divide-y">
              {pairRows.map((permission) => {
                const different = differs(pair, permission.id);
                return (
                  <li
                    key={permission.id}
                    className={cn(
                      "grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-2 border-l-2 border-transparent px-3 py-2",
                      different && "border-l-warning bg-warning/10",
                    )}
                  >
                    <span className="min-w-0">
                      {permission.label}
                      {different ? <span className="sr-only"> (distinto)</span> : null}
                    </span>
                    {pair.map((role, index) => (
                      <span key={index} className="text-center">
                        <Mark yes={has(role, permission.id)} label={role.name} />
                      </span>
                    ))}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Mark({ yes, label }: { yes: boolean; label?: string }) {
  const text = `${label ? `${label}: ` : ""}${yes ? "sí" : "no"}`;
  return yes ? (
    <CheckIcon aria-label={text} className="text-success inline size-4" />
  ) : (
    <MinusIcon aria-label={text} className="text-muted-foreground inline size-4" />
  );
}

function Same() {
  return (
    <p role="status" className="text-muted-foreground p-4 text-center text-sm">
      Tienen los mismos permisos.
    </p>
  );
}
