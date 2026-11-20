"use client";

import type { ComponentProps, FormEvent, ReactNode } from "react";
import {
  CABLE_ACTIONS,
  ACTIVITY_ORIGINS,
  ACTIVITY_ORIGIN_LABELS,
  CABLE_ACTION_LABELS,
  DATE_SORTS,
  DATE_SORT_LABELS,
  activityQuery,
  parseActivitySearch,
  type ActivitySearch,
} from "@cables/shared";
import { FormActions } from "@/components/form-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { SearchableSelect, toOptions } from "@/components/searchable-select";
import { usePendingNavigation } from "@/components/pending-list";

type Props = {
  basePath: string;
  search: ActivitySearch;
  /** Only who sees everyone's activity filters by person («Yo» first); the rest see their own. */
  users?: { id: string; label: string }[];
};

/** Filters of the activity pages. They navigate to a clean, shareable URL. */
export function ActivityFilters({ basePath, search, users }: Props) {
  const { navigate, pending } = usePendingNavigation();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(
      [...new FormData(event.currentTarget)].map(([key, value]) => [key, String(value)]),
    );
    // El tamaño de página no es un filtro: se conserva al filtrar.
    const size = search.size === undefined ? {} : { size: String(search.size) };
    navigate(`${basePath}${activityQuery(parseActivitySearch({ ...values, ...size }))}`);
  }

  return (
    <form
      key={activityQuery(search)}
      onSubmit={submit}
      aria-label="Filtrar movimientos"
      className="bg-card space-y-4 rounded-lg border p-4"
    >
      <div className={`grid gap-3 sm:grid-cols-2 ${users ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
        {users ? (
          <Field label="Quién" htmlFor="actor">
            <SearchableSelect
              id="actor"
              name="actor"
              defaultValue={search.actor}
              options={toOptions(users)}
              emptyLabel="Todos"
            />
          </Field>
        ) : null}
        <Field label="Origen" htmlFor="origin">
          <NativeSelect id="origin" name="origin" defaultValue={search.origin ?? "people"}>
            {ACTIVITY_ORIGINS.map((origin) => (
              <option key={origin} value={origin}>
                {ACTIVITY_ORIGIN_LABELS[origin]}
              </option>
            ))}
          </NativeSelect>
        </Field>
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
        <Field label="Orden" htmlFor="sort">
          <NativeSelect id="sort" name="sort" defaultValue={search.sort ?? "newest"}>
            {DATE_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {DATE_SORT_LABELS[sort]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <FormActions
        submitLabel="Aplicar"
        pending={pending}
        clearHref={basePath}
        // Sin página ni tamaño (no son filtros): solo cuenta lo que la persona ha elegido.
        active={activityQuery({ ...search, page: undefined, size: undefined }) !== ""}
      />
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
