"use client";

import { useRouter } from "next/navigation";
import type { ComponentProps, FormEvent, ReactNode } from "react";
import {
  CABLE_ACTIONS,
  CABLE_ACTION_LABELS,
  activityQuery,
  parseActivitySearch,
  type ActivitySearch,
} from "@cables/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

type Props = {
  basePath: string;
  search: ActivitySearch;
  /** Only "Actividad reciente" filters by person; "Mi actividad" is always the current user. */
  users?: { id: string; label: string }[];
};

/** Filters of the activity pages. They navigate to a clean, shareable URL. */
export function ActivityFilters({ basePath, search, users }: Props) {
  const router = useRouter();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(
      [...new FormData(event.currentTarget)].map(([key, value]) => [key, String(value)]),
    );
    router.push(`${basePath}${activityQuery(parseActivitySearch(values))}`);
  }

  return (
    <form
      key={activityQuery(search)}
      onSubmit={submit}
      aria-label="Filtrar movimientos"
      className="space-y-4 rounded-lg border p-4"
    >
      <div className={`grid gap-3 sm:grid-cols-2 ${users ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        {users ? (
          <Field label="Quién" htmlFor="actor">
            <Select id="actor" name="actor" defaultValue={search.actor}>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Qué hizo" htmlFor="action">
          <Select id="action" name="action" defaultValue={search.action}>
            {CABLE_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {CABLE_ACTION_LABELS[action]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Desde" htmlFor="from">
          <Input id="from" name="from" type="date" defaultValue={search.from ?? ""} />
        </Field>
        <Field label="Hasta" htmlFor="to">
          <Input id="to" name="to" type="date" defaultValue={search.to ?? ""} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit">Filtrar</Button>
        <Button type="button" variant="ghost" onClick={() => router.push(basePath)}>
          Limpiar filtros
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Select({ children, defaultValue, ...props }: ComponentProps<"select">) {
  return (
    <NativeSelect {...props} defaultValue={defaultValue ?? ""}>
      <option value="">Todos</option>
      {children}
    </NativeSelect>
  );
}
