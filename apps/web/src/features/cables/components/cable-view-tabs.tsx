"use client";

import { useState } from "react";
import { PendingLink, usePendingNavigation } from "@/components/pending-list";

export type CableViewTab = { id: string; label: string; href: string; count?: number };

// A todo el ancho y con color: se ve cuál está elegida sin que ocupen media pantalla.
const TAB =
  "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1 text-sm outline-none transition-colors focus-visible:ring-ring/50 focus-visible:ring-3";

/**
 * «Recorrido» and «Conexionado». Both are the same page with another `?vista=`, so Next.js shows
 * no loading screen between them: inside a `PendingListProvider`, the tab pressed is marked at
 * once and the content below (its `PendingResults`) shows «Cargando…» until the view arrives.
 */
export function CableViewTabs({ tabs, current }: { tabs: CableViewTab[]; current: string }) {
  const { pending } = usePendingNavigation();
  const [pressed, setPressed] = useState<string | null>(null);
  // Mientras llega la vista pulsada, ya se ve como la actual.
  const shown = pending && pressed ? pressed : current;

  return (
    <nav
      aria-label="Vista del cable"
      className="bg-muted/60 flex gap-1 rounded-lg border p-0.5 md:max-w-md"
    >
      {tabs.map((tab) => {
        const active = tab.id === shown;
        return (
          <PendingLink
            key={tab.id}
            href={tab.href}
            aria-current={tab.id === current ? "page" : undefined}
            onClick={() => setPressed(tab.id)}
            className={
              active
                ? `${TAB} bg-primary text-primary-foreground font-semibold shadow-sm`
                : `${TAB} text-foreground hover:bg-muted font-medium`
            }
          >
            {tab.label}
            {tab.count ? (
              <span className="rounded-full bg-current/15 px-1.5 text-xs tabular-nums">
                {tab.count}
              </span>
            ) : null}
          </PendingLink>
        );
      })}
    </nav>
  );
}
