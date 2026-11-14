"use client";

import { cn } from "cn";
import { useState } from "react";
import { drawingMarkRank, traySectionOf, type DrawingMark } from "@cables/shared";
import type { TraySheet } from "@/server/trays/service";
import { DrawingViewer } from "./drawing-viewer";

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

      {sheets.length > 1 ? (
        <ul aria-label="Hojas donde aparece" className="bg-card divide-y rounded-lg border">
          {sheets.map((item, index) => (
            <li key={`${item.drawing}-${item.sheet}`}>
              <button
                type="button"
                aria-current={index === selected ? "true" : undefined}
                onClick={() => setSelected(index)}
                className={cn(
                  "focus-visible:ring-ring/50 flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-3",
                  index === selected ? "bg-muted" : "hover:bg-muted/50",
                )}
              >
                <span>
                  <span className="font-mono font-medium">{item.drawing}</span> · hoja {item.sheet}
                  {item.title ? (
                    <span className="text-muted-foreground"> · {item.title}</span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    "text-xs",
                    drawingMarkRank(item.marks) <= 1 ? "text-warning" : "text-muted-foreground",
                  )}
                >
                  {sheetHint(code, item.marks)}
                  {item.image ? "" : " · sin imagen"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
