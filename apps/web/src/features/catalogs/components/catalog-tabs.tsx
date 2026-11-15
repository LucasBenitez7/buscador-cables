"use client";

import { cn } from "cn";
import { useState, type KeyboardEvent } from "react";
import { CATALOG_KINDS, CATALOG_LABELS, type CatalogItem, type CatalogKind } from "@cables/shared";
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
      <div
        role="tablist"
        aria-label="Catálogos"
        onKeyDown={onKeyDown}
        className="bg-muted/40 grid grid-cols-3 gap-1 rounded-lg border p-1"
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
                "focus-visible:ring-ring/50 flex min-w-0 flex-col items-center justify-center gap-1 rounded-md px-2 py-2 text-center text-sm leading-tight font-medium transition-colors outline-none focus-visible:ring-3 sm:flex-row sm:gap-2 sm:px-3",
                selected
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {CATALOG_LABELS[kind].plural}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  selected ? "bg-primary-foreground/15" : "bg-muted",
                )}
              >
                {catalogs[kind].length}
              </span>
            </button>
          );
        })}
      </div>

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
