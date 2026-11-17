"use client";

import { useState } from "react";
import { PendingLink, usePendingNavigation } from "@/components/pending-list";

export type CableViewTab = { id: string; label: string; href: string; count?: number };

const TAB =
  "-mb-px border-b-2 px-4 py-2 text-sm outline-none focus-visible:ring-ring/50 rounded-t-md focus-visible:ring-3";

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
    <nav aria-label="Vista del cable" className="flex gap-1 border-b">
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
                ? `${TAB} border-primary text-foreground font-semibold`
                : `${TAB} text-muted-foreground hover:text-foreground border-transparent font-medium`
            }
          >
            {tab.label}
            {tab.count ? (
              <span className="text-muted-foreground ml-1.5 text-xs">{tab.count}</span>
            ) : null}
          </PendingLink>
        );
      })}
    </nav>
  );
}
