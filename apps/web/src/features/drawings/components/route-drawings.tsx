"use client";

import { useState } from "react";
import type { RouteSheet } from "@/server/drawings/route-sheets";
import { ROUTE_LEGEND, StatusLegend } from "@/features/cables/components/status-legend";
import { DrawingViewer } from "./drawing-viewer";
import { SheetPicker } from "./sheet-picker";

/**
 * The cable's route on the drawings: on each sheet, its trays numbered in route order, blue
 * where the cable is laid, violet where it has not got yet, and amber with the arrow where the
 * loose end waits (the colours of `status-tones.ts`). The sheet with the loose end (or the most trays) opens first.
 */
export function RouteDrawings({ sheets }: { sheets: RouteSheet[] }) {
  const [selected, setSelected] = useState(0);
  const sheet = sheets[selected];
  if (!sheet) return null;

  return (
    <div className="space-y-3">
      <SheetPicker
        label="Hojas del recorrido"
        selected={selected}
        onSelect={setSelected}
        sheets={sheets.map((item) => ({
          key: item.key,
          drawing: item.drawing,
          sheet: item.sheet,
          title: item.title,
          detail: `${item.trays} ${item.trays === 1 ? "bandeja del recorrido" : "bandejas del recorrido"}`,
          accent: item.hasLooseEnd ? "Aquí está la punta suelta" : null,
        }))}
      />
      <DrawingViewer
        key={sheet.key}
        imageKey={sheet.key}
        width={sheet.width}
        height={sheet.height}
        marks={sheet.marks}
        label={`Recorrido del cable en el plano ${sheet.drawing}, hoja ${sheet.sheet}`}
      />
      <StatusLegend note="Los números son los tramos del recorrido." items={ROUTE_LEGEND} />
    </div>
  );
}
