"use client";

import { useState, useTransition, type FormEvent } from "react";
import { CATALOG_LABELS, type CatalogItem, type CatalogKind } from "@cables/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createCatalogItemAction,
  deleteCatalogItemAction,
  updateCatalogItemAction,
} from "@/features/catalogs/actions";
import type { ActionResult } from "@/lib/action-result";

type Props = { kind: CatalogKind; items: CatalogItem[] };

/** From this many items the list gets a search box. */
const FILTER_FROM = 8;

/** One catalog: the add form first, then a searchable list with inline edit/delete. */
export function CatalogSection({ kind, items }: Props) {
  const labels = CATALOG_LABELS[kind];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [filter, setFilter] = useState("");
  const [pending, startTransition] = useTransition();

  function run(
    action: (formData: FormData) => Promise<ActionResult>,
    data: Record<string, string>,
  ) {
    const formData = new FormData();
    for (const [key, value] of Object.entries({ kind, ...data })) {
      formData.set(key, value);
    }
    return new Promise<ActionResult>((resolve) => {
      startTransition(async () => {
        const result = await action(formData);
        setMessage(result);
        resolve(result);
      });
    });
  }

  function remove(item: CatalogItem) {
    if (window.confirm(`¿Eliminar "${item.name}"?`)) {
      void run(deleteCatalogItemAction, { id: item.id });
    }
  }

  const needle = filter.trim().toLowerCase();
  const visible = needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items;

  return (
    <section className="space-y-4" aria-labelledby={`catalog-${kind}`}>
      {/* La pestaña ya lo dice a la vista; el título queda para los lectores de pantalla. */}
      <h2 id={`catalog-${kind}`} className="sr-only">
        {labels.plural} <span className="text-muted-foreground text-sm">({items.length})</span>
      </h2>

      {/* El alta va arriba: con cientos de elementos no hay que bajar hasta el final. */}
      <div className="bg-card space-y-2 rounded-lg border p-3">
        <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Añadir {labels.singular.toLowerCase()}
        </h3>
        <ItemForm
          kind={kind}
          submitLabel="Añadir"
          pending={pending}
          onSubmit={async (values) => (await run(createCatalogItemAction, values)).ok}
        />
        {message ? (
          <p
            role="status"
            className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}
          >
            {message.message}
          </p>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">Todavía no hay ninguno.</p>
      ) : (
        <div className="space-y-2">
          {items.length > FILTER_FROM ? (
            <div className="flex flex-wrap items-center gap-3">
              <Input
                type="search"
                aria-label={`Buscar en ${labels.plural.toLowerCase()}`}
                placeholder={`Buscar en ${labels.plural.toLowerCase()}…`}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                className="sm:max-w-sm"
              />
              {needle ? (
                <span className="text-muted-foreground text-xs">
                  {visible.length} de {items.length}
                </span>
              ) : null}
            </div>
          ) : null}
          {visible.length === 0 ? (
            <p className="text-muted-foreground text-sm">Ninguno contiene «{filter.trim()}».</p>
          ) : (
            <ul className="bg-card divide-y rounded-lg border">
              {visible.map((item) =>
                editingId === item.id ? (
                  <li key={item.id} className="px-3 py-2">
                    <ItemForm
                      kind={kind}
                      initial={item}
                      submitLabel="Guardar"
                      pending={pending}
                      onSubmit={async (values) => {
                        const result = await run(updateCatalogItemAction, {
                          id: item.id,
                          ...values,
                        });
                        if (result.ok) {
                          setEditingId(null);
                        }
                        return result.ok;
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  </li>
                ) : (
                  <li
                    key={item.id}
                    className="hover:bg-muted/40 flex flex-wrap items-center gap-3 px-3 py-2 text-sm transition-colors"
                  >
                    {kind === "color" ? (
                      <span
                        aria-hidden
                        className="border-foreground/40 size-4 rounded-full border"
                        style={{ backgroundColor: item.hex ?? "transparent" }}
                      />
                    ) : null}
                    <span className="font-medium">{item.name}</span>
                    <span
                      className={
                        item.cableCount > 0
                          ? "text-muted-foreground text-xs"
                          : "text-muted-foreground/60 text-xs"
                      }
                    >
                      {item.cableCount} {item.cableCount === 1 ? "cable" : "cables"}
                    </span>
                    <span className="ml-auto flex gap-1">
                      <Button size="xs" variant="ghost" onClick={() => setEditingId(item.id)}>
                        Editar
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/15 hover:text-destructive dark:hover:bg-destructive/15"
                        onClick={() => remove(item)}
                        disabled={pending}
                        aria-label={`Eliminar ${item.name}`}
                      >
                        Eliminar
                      </Button>
                    </span>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

type FormProps = {
  kind: CatalogKind;
  initial?: CatalogItem;
  submitLabel: string;
  pending: boolean;
  /** Returns true when saved, so the add form can clear itself. */
  onSubmit: (values: { name: string; hex: string }) => Promise<boolean>;
  onCancel?: () => void;
};

function ItemForm({ kind, initial, submitLabel, pending, onSubmit, onCancel }: FormProps) {
  // Campos controlados y envío con onSubmit: solo se vacían tras guardar con éxito.
  const [name, setName] = useState(initial?.name ?? "");
  const [hex, setHex] = useState(initial?.hex ?? "");
  const label = CATALOG_LABELS[kind].singular;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onSubmit({ name, hex });
    if (saved && !initial) {
      setName("");
      setHex("");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <Input
        aria-label={initial ? `Nombre de ${initial.name}` : `Nuevo: ${label.toLowerCase()}`}
        placeholder={initial ? undefined : `Nuevo: ${label.toLowerCase()}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="min-w-0 flex-1 sm:max-w-sm"
        required
      />
      {kind === "color" ? (
        <Input
          aria-label="Color (#RRGGBB)"
          placeholder="#RRGGBB"
          value={hex}
          onChange={(event) => setHex(event.target.value)}
          className="w-28 font-mono uppercase"
        />
      ) : null}
      <Button type="submit" disabled={pending}>
        {submitLabel}
      </Button>
      {onCancel ? (
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      ) : null}
    </form>
  );
}
