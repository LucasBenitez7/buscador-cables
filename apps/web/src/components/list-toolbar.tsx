"use client";

import type { FormEvent, ReactNode } from "react";
import { PendingLink, SubmitLabel, usePendingNavigation } from "@/components/pending-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

export type ToolbarSearch = {
  name: string;
  label: string;
  value?: string;
  placeholder?: string;
  /** Códigos: fuente monoespaciada en mayúsculas. */
  mono?: boolean;
  maxLength?: number;
};

export type ToolbarSort = {
  name: string;
  value: string;
  options: readonly { value: string; label: string }[];
  /** Este orden no se escribe en la URL (la página sin parámetro ya lo usa). */
  defaultValue: string;
};

export type ToolbarFilter =
  | {
      kind: "select";
      name: string;
      label: string;
      value?: string;
      options: readonly { value: string; label: string }[];
    }
  | { kind: "checkbox"; name: string; label: string; checked?: boolean };

type Props = {
  /** Ruta a la que se aplica la búsqueda ("/trays"). */
  action: string;
  /** Nombre accesible de la barra ("Buscar bandejas"). */
  label: string;
  search: ToolbarSearch;
  sort?: ToolbarSort;
  filters?: readonly ToolbarFilter[];
  /** Valores que no son filtros pero deben sobrevivir (el tamaño de página). */
  keep?: Record<string, string>;
  /** Hay algún filtro puesto: muestra «Limpiar». */
  active?: boolean;
  /** Recuento de la lista, debajo de la barra (role="status"). */
  count: ReactNode;
};

/**
 * La barra de búsqueda de las listas: búsqueda, orden y filtros con el mismo aspecto y el
 * mismo orden de campos. Es un GET que funciona sin JavaScript; con él, va a una URL limpia sin
 * los valores vacíos ni el orden por defecto, y muestra «Cargando…» mientras navega.
 */
export function ListToolbar({
  action,
  label,
  search,
  sort,
  filters = [],
  keep = {},
  active = false,
  count,
}: Props) {
  const { navigate, pending } = usePendingNavigation();
  const keepQuery = new URLSearchParams(keep).toString();
  const clear = `${action}${keepQuery ? `?${keepQuery}` : ""}`;
  const idOf = (name: string) => `toolbar-${action.replace(/\W+/g, "-")}-${name}`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (trimmed === "") continue;
      if (sort && key === sort.name && trimmed === sort.defaultValue) continue;
      params.set(key, trimmed);
    }
    const query = params.toString();
    navigate(`${action}${query ? `?${query}` : ""}`);
  }

  // Los campos no están controlados: la clave los reinicia cuando cambian los valores de la URL
  // («Limpiar», el botón atrás). Sin ella, el orden y las casillas se quedaban como estaban.
  const formKey = JSON.stringify([
    search.value ?? "",
    sort?.value ?? "",
    filters.map((filter) => (filter.kind === "checkbox" ? Boolean(filter.checked) : filter.value)),
  ]);

  return (
    <div className="space-y-3">
      <form
        key={formKey}
        method="get"
        action={action}
        role="search"
        aria-label={label}
        onSubmit={submit}
        className="bg-card space-y-3 rounded-lg border p-4"
      >
        {Object.entries(keep).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <div className="flex flex-wrap items-end gap-3">
          {/* En el móvil la búsqueda ocupa su fila; el orden y los botones van debajo. */}
          <div className="w-full min-w-0 space-y-1.5 sm:w-auto sm:min-w-56 sm:flex-1">
            <Label htmlFor={idOf(search.name)}>{search.label}</Label>
            <Input
              id={idOf(search.name)}
              name={search.name}
              type="search"
              defaultValue={search.value ?? ""}
              placeholder={search.placeholder}
              maxLength={search.maxLength}
              autoComplete="off"
              spellCheck={false}
              className={search.mono ? "font-mono uppercase" : undefined}
            />
          </div>
          {sort ? (
            <div className="min-w-0 flex-1 space-y-1.5 sm:flex-none">
              <Label htmlFor={idOf(sort.name)}>Orden</Label>
              <NativeSelect id={idOf(sort.name)} name={sort.name} defaultValue={sort.value}>
                {sort.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          <Button type="submit" disabled={pending}>
            <SubmitLabel pending={pending} idle="Buscar" />
          </Button>
          {active ? (
            <Button asChild type="button" variant="ghost">
              <PendingLink href={clear}>Limpiar</PendingLink>
            </Button>
          ) : null}
        </div>
        {filters.length > 0 ? (
          <div className="flex flex-wrap items-end gap-3">
            {filters.map((filter) =>
              filter.kind === "checkbox" ? (
                <label
                  key={filter.name}
                  className="flex min-h-10 cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name={filter.name}
                    value="1"
                    defaultChecked={filter.checked}
                    className="accent-primary size-4"
                  />
                  {filter.label}
                </label>
              ) : (
                <div key={filter.name} className="min-w-36 flex-1 space-y-1.5 sm:flex-none">
                  <Label htmlFor={idOf(filter.name)}>{filter.label}</Label>
                  <NativeSelect
                    id={idOf(filter.name)}
                    name={filter.name}
                    defaultValue={filter.value ?? ""}
                  >
                    <option value="">Todos</option>
                    {filter.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ),
            )}
          </div>
        ) : null}
      </form>
      <p role="status" className="text-muted-foreground text-sm">
        {count}
      </p>
    </div>
  );
}
