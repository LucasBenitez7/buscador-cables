"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
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
  /** Some filter is on: shows "Quitar filtros". */
  active?: boolean;
  /** Id of the section to come back to after filtering (`historial`). */
  anchor?: string;
};

/**
 * The filters and order of a list, the same everywhere. A GET form, so it also works without
 * JavaScript; with it, it goes to a clean URL without the empty values. The server reads the
 * URL with Zod and ignores anything invalid.
 */
export function FilterForm({ action, label, fields, keep = {}, active = false, anchor }: Props) {
  const hash = anchor ? `#${anchor}` : "";
  const router = useRouter();
  const clear = `${action}${new URLSearchParams(keep).size > 0 ? `?${new URLSearchParams(keep)}` : ""}${hash}`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (typeof value === "string" && value.trim() !== "") params.set(key, value.trim());
    }
    const query = params.toString();
    router.push(`${action}${query ? `?${query}` : ""}${hash}`, { scroll: !anchor });
  }

  return (
    <form
      method="get"
      action={`${action}${hash}`}
      onSubmit={submit}
      aria-label={label}
      className="bg-card space-y-3 rounded-lg border p-3"
    >
      {Object.entries(keep).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map((field) => {
          const id = `filter-${action.replace(/\W+/g, "-")}-${field.name}`;
          return (
            <div key={field.name} className="min-w-0 space-y-1.5">
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
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm">
          Aplicar
        </Button>
        {active ? (
          <Button asChild type="button" variant="ghost" size="sm">
            <Link href={clear}>Quitar filtros</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
