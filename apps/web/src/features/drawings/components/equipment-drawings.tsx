"use client";

import { useState } from "react";
import type { EquipmentSheet } from "@/server/equipment/service";
import { DrawingViewer } from "./drawing-viewer";
import { SheetPicker } from "./sheet-picker";

/** What the sheet writes, when it is not the tag itself (fase 19). */
const drawnAsHint = (tag: string, sheet: EquipmentSheet) =>
  sheet.drawnAs.toUpperCase() === tag.toUpperCase()
    ? "Equipo marcado en el plano"
    : `En el plano como ${sheet.drawnAs}`;

/**
 * The sheets where an equipment is written, with the first one open in the viewer and a list
 * to switch, as for a tray. Sheets not drawn yet are listed, without image.
 */
export function EquipmentDrawings({ tag, sheets }: { tag: string; sheets: EquipmentSheet[] }) {
  const [selected, setSelected] = useState(0);
  const sheet = sheets[selected];
  if (!sheet) return null;
  const name = `Plano ${sheet.drawing}, hoja ${sheet.sheet}`;

  return (
    <div className="space-y-3">
      <SheetPicker
        label="Hojas donde aparece"
        selected={selected}
        onSelect={setSelected}
        sheets={sheets.map((item) => ({
          key: `${item.drawing}-${item.sheet}`,
          drawing: item.drawing,
          sheet: item.sheet,
          title: item.title,
          detail: drawnAsHint(tag, item),
          accent: null,
          missingImage: !item.image,
        }))}
      />
      {sheet.image ? (
        <>
          <DrawingViewer
            key={`${sheet.image.key}-${tag}`}
            imageKey={sheet.image.key}
            width={sheet.image.width}
            height={sheet.image.height}
            marks={sheet.marks}
            redMarksKey={sheet.image.redMarks}
            label={`${name}${sheet.title ? ` (${sheet.title})` : ""}`}
          />
          <p className="text-muted-foreground text-xs">
            {drawnAsHint(tag, sheet)}. Arrastra para moverte y usa la rueda o dos dedos para el
            zoom.
          </p>
        </>
      ) : (
        <p className="text-muted-foreground rounded-lg border p-4 text-sm">
          La imagen de este plano todavía no está disponible.
        </p>
      )}
    </div>
  );
}
