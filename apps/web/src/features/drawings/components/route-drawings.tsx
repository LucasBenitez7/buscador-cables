"use client";

import { cn } from "cn";
import { useState } from "react";
import type { RouteSheet } from "@/server/drawings/route-sheets";
import { DrawingViewer } from "./drawing-viewer";

/**
 * The cable's route on the drawings: on each sheet, its trays numbered in route order, green
 * where the cable is laid, grey where it has not got yet, and amber with the arrow where the
 * loose end waits. The sheet with the loose end (or the most trays) opens first.
 */
export function RouteDrawings({ sheets }: { sheets: RouteSheet[] }) {
  const [selected, setSelected] = useState(0);
  const sheet = sheets[selected];
  if (!sheet) return null;

  return (
    <div className="space-y-3">
      {sheets.length > 1 ? (
        <div role="group" aria-label="Hojas del recorrido" className="flex flex-wrap gap-1.5">
          {sheets.map((item, index) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={index === selected}
              onClick={() => setSelected(index)}
              className={cn(
                "focus-visible:ring-ring/50 rounded-md border px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-3",
                index === selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-muted bg-background",
              )}
            >
              <span className="font-mono">{item.drawing}</span> · hoja {item.sheet} · {item.trays}{" "}
              {item.trays === 1 ? "bandeja" : "bandejas"}
              {item.hasLooseEnd ? " · está aquí" : ""}
            </button>
          ))}
        </div>
      ) : null}
      <DrawingViewer
        key={sheet.key}
        imageKey={sheet.key}
        width={sheet.width}
        height={sheet.height}
        marks={sheet.marks}
        label={`Recorrido del cable en el plano ${sheet.drawing}, hoja ${sheet.sheet}`}
      />
      <p className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>Los números son los tramos del recorrido.</span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="border-success size-3 rounded-full border-2" /> Tendido
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="border-muted-foreground size-3 rounded-full border-2" />{" "}
          Falta o sin datos
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="border-warning size-3 rounded-full border-2" /> Dónde está la
          punta suelta
        </span>
      </p>
    </div>
  );
}
