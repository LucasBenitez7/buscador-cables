"use client";

import { cn } from "cn";
import { ChevronDownIcon, SlidersHorizontalIcon } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { FormActions } from "@/components/form-actions";
import { usePendingNavigation } from "@/components/pending-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

export type FilterOption = { value: string; label: string };

export type FilterField =
  | {
      kind: "select";
      name: string;
      label: string;
      value?: string;
      options: readonly FilterOption[];
      /** First option meaning "no filter"; `null` for selects that always have a value (order). */
      emptyLabel?: string | null;
    }
  | { kind: "text"; name: string; label: string; value?: string; placeholder?: string }
  | { kind: "date"; name: string; label: string; value?: string };

type Props = {
  /** Path the filters apply to ("/admin/users"). */
  action: string;
  /** Accessible name of the form ("Filtrar cuentas"). */
  label: string;
  fields: readonly FilterField[];
  /** Values that are not filters but must survive them (`vista=conexionado`). */
  keep?: Record<string, string>;
  /** Some filter is on: «Limpiar» works (otherwise it is greyed out). */
  active?: boolean;
  /** Id of the section to come back to after filtering (`historial`). */
  anchor?: string;
};

/**
 * The filters and order of a list, the same everywhere. A GET form, so it also works without
 * JavaScript; with it, it goes to a clean URL without the empty values. The server reads the
 * URL with Zod and ignores anything invalid. On a phone only the first field shows; the rest
 * unfold with «Más filtros», so the list is not pushed a screen down.
 */
export function FilterForm({ action, label, fields, keep = {}, active = false, anchor }: Props) {
  const hash = anchor ? `#${anchor}` : "";
  const { navigate, pending } = usePendingNavigation();
  const [expanded, setExpanded] = useState(false);
  const moreId = useId();
  // Filtros puestos aparte del primero: se cuentan en el botón aunque estén plegados.
  const hiddenActive = fields.slice(1).filter((field) => field.value).length;
  const clear = `${action}${new URLSearchParams(keep).size > 0 ? `?${new URLSearchParams(keep)}` : ""}${hash}`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (typeof value === "string" && value.trim() !== "") params.set(key, value.trim());
    }
    const query = params.toString();
    navigate(`${action}${query ? `?${query}` : ""}${hash}`, { scroll: !anchor });
  }

  // Los campos no están controlados: la clave los reinicia cuando cambian los valores de la URL
  // («Limpiar», el botón atrás). Sin ella, los selects se quedaban como estaban.
  const formKey = JSON.stringify(fields.map((field) => field.value ?? ""));

  return (
    <form
      key={formKey}
      method="get"
      action={`${action}${hash}`}
      onSubmit={submit}
      aria-label={label}
      className="bg-card space-y-4 rounded-lg border p-4"
    >
      {Object.entries(keep).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map((field, index) => {
          const id = `filter-${action.replace(/\W+/g, "-")}-${field.name}`;
          return (
            <div
              key={field.name}
              id={index === 1 ? moreId : undefined}
              className={cn("min-w-0 space-y-1.5", index > 0 && !expanded && "max-md:hidden")}
            >
              <Label htmlFor={id}>{field.label}</Label>
              {field.kind === "select" ? (
                <NativeSelect
                  id={id}
                  name={field.name}
                  defaultValue={
                    field.value ?? (field.emptyLabel === null ? field.options[0]?.value : "")
                  }
                >
                  {field.emptyLabel === null ? null : (
                    <option value="">{field.emptyLabel ?? "Todos"}</option>
                  )}
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <Input
                  id={id}
                  name={field.name}
                  type={field.kind === "date" ? "date" : "search"}
                  defaultValue={field.value ?? ""}
                  placeholder={field.kind === "text" ? field.placeholder : undefined}
                  autoComplete="off"
                  maxLength={120}
                />
              )}
            </div>
          );
        })}
      </div>
      {fields.length > 1 ? (
        <Button
          type="button"
          variant="outline"
          className="w-full md:hidden"
          aria-expanded={expanded}
          aria-controls={moreId}
          onClick={() => setExpanded((value) => !value)}
        >
          <SlidersHorizontalIcon />
          {expanded ? "Menos filtros" : "Más filtros"}
          {hiddenActive > 0 ? ` (${hiddenActive})` : ""}
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "transition-transform motion-safe:duration-200",
              expanded && "rotate-180",
            )}
          />
        </Button>
      ) : null}
      <FormActions
        // «Buscar» si hay un cuadro de texto; si solo hay filtros, «Aplicar».
        submitLabel={fields.some((field) => field.kind === "text") ? "Buscar" : "Aplicar"}
        pending={pending}
        clearHref={clear}
        active={active}
      />
    </form>
  );
}
