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

/** One catalog: list with inline edit/delete and an add form. */
export function CatalogSection({ kind, items }: Props) {
  const labels = CATALOG_LABELS[kind];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<ActionResult | null>(null);
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

  return (
    <section className="space-y-3 rounded-lg border p-4" aria-labelledby={`catalog-${kind}`}>
      <h2 id={`catalog-${kind}`} className="text-base font-medium">
        {labels.plural} <span className="text-muted-foreground text-sm">({items.length})</span>
      </h2>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">Todavía no hay ninguno.</p>
      ) : (
        <ul className="divide-y">
          {items.map((item) =>
            editingId === item.id ? (
              <li key={item.id} className="py-2">
                <ItemForm
                  kind={kind}
                  initial={item}
                  submitLabel="Guardar"
                  pending={pending}
                  onSubmit={async (values) => {
                    const result = await run(updateCatalogItemAction, { id: item.id, ...values });
                    if (result.ok) {
                      setEditingId(null);
                    }
                    return result.ok;
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li key={item.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                {kind === "color" ? (
                  <span
                    aria-hidden
                    className="border-foreground/40 size-4 rounded-full border"
                    style={{ backgroundColor: item.hex ?? "transparent" }}
                  />
                ) : null}
                <span className="font-medium">{item.name}</span>
                <span className="text-muted-foreground text-xs">
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

      <ItemForm
        kind={kind}
        submitLabel="Añadir"
        pending={pending}
        onSubmit={async (values) => (await run(createCatalogItemAction, values)).ok}
      />

      {message ? (
        <p role="status" className={message.ok ? "text-sm" : "text-destructive text-sm"}>
          {message.message}
        </p>
      ) : null}
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
        className="w-56"
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
      <Button type="submit" size="sm" disabled={pending}>
        {submitLabel}
      </Button>
      {onCancel ? (
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      ) : null}
    </form>
  );
}
