"use client";

import { cn } from "cn";
import { useState, type KeyboardEvent } from "react";
import { CATALOG_KINDS, CATALOG_LABELS, type CatalogItem, type CatalogKind } from "@cables/shared";
import { ChipRow } from "@/components/chip-row";
import { CatalogSection } from "./catalog-section";

type Props = { catalogs: Record<CatalogKind, CatalogItem[]> };

/**
 * One tab per catalog, so each list starts at the top of the screen (on the phone they were
 * stacked and the last one was hundreds of rows down). Every panel stays mounted: switching
 * tabs keeps what was typed in each one.
 */
export function CatalogTabs({ catalogs }: Props) {
  const [active, setActive] = useState<CatalogKind>(CATALOG_KINDS[0]);

  // Flechas izquierda/derecha entre pestañas, como en cualquier tablist.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const index = CATALOG_KINDS.indexOf(active);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = CATALOG_KINDS[(index + step + CATALOG_KINDS.length) % CATALOG_KINDS.length]!;
    setActive(next);
    document.getElementById(`tab-${next}`)?.focus();
  }

  return (
    <div className="space-y-5">
      <ChipRow
        role="tablist"
        aria-label="Catálogos"
        onKeyDown={onKeyDown}
        // Una sola fila fina: si no caben, se desliza de lado.
        // En el móvil se desliza con el dedo; en el portátil se ve la barra si no caben.
        className="-mx-4 gap-2 px-4 pb-1 sm:mx-0 sm:px-0"
      >
        {CATALOG_KINDS.map((kind) => {
          const selected = kind === active;
          return (
            <button
              key={kind}
              id={`tab-${kind}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`panel-${kind}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(kind)}
              className={cn(
                "focus-visible:ring-ring/50 flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3",
                selected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-foreground hover:bg-muted",
              )}
            >
              {CATALOG_LABELS[kind].plural}
              <span
                className={cn(
                  "tabular-nums",
                  selected ? "text-primary-foreground" : "text-foreground/80",
                )}
              >
                {catalogs[kind].length}
              </span>
            </button>
          );
        })}
      </ChipRow>

      {CATALOG_KINDS.map((kind) => (
        <div
          key={kind}
          id={`panel-${kind}`}
          role="tabpanel"
          aria-labelledby={`tab-${kind}`}
          hidden={kind !== active}
        >
          <CatalogSection kind={kind} items={catalogs[kind]} />
        </div>
      ))}
    </div>
  );
}
