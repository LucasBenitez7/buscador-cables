"use client";

import { useState } from "react";
import { drawingMarkRank, traySectionOf, type DrawingMark } from "@cables/shared";
import type { TraySheet } from "@/server/trays/service";
import { DrawingViewer } from "./drawing-viewer";
import { SheetPicker } from "./sheet-picker";

/** What the sheet says about where the tray is, in words. */
export function sheetHint(code: string, marks: readonly DrawingMark[]): string {
  switch (drawingMarkRank(marks)) {
    case 0:
      return "Bandeja marcada en el plano";
    case 1:
      return `Bandera de la sección ${traySectionOf(code)}`;
    case 2:
      return `Solo en la tabla de la sección ${traySectionOf(code)}`;
    default:
      return "Sin marca";
  }
}

/**
 * The sheets where a tray is, with the best one open in the viewer and a list to switch.
 * Sheets that `pnpm data:render` has not drawn yet are listed, without image.
 */
export function TrayDrawings({ code, sheets }: { code: string; sheets: TraySheet[] }) {
  const [selected, setSelected] = useState(() => {
    const firstWithImage = sheets.findIndex((sheet) => sheet.image);
    return firstWithImage === -1 ? 0 : firstWithImage;
  });
  const sheet = sheets[selected];
  if (!sheet) return null;
  const name = (item: TraySheet) => `Plano ${item.drawing}, hoja ${item.sheet}`;

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
          detail: sheetHint(code, item.marks),
          accent: drawingMarkRank(item.marks) === 0 ? "La bandeja está dibujada" : null,
          missingImage: !item.image,
        }))}
      />
      {sheet.image ? (
        <>
          <DrawingViewer
            key={`${sheet.image.key}-${code}`}
            imageKey={sheet.image.key}
            width={sheet.image.width}
            height={sheet.image.height}
            marks={sheet.marks}
            label={`${name(sheet)}${sheet.title ? ` (${sheet.title})` : ""}`}
          />
          <p className="text-muted-foreground text-xs">
            {sheetHint(code, sheet.marks)}. Arrastra para moverte y usa la rueda o dos dedos para el
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
