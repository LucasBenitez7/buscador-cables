"use client";

import { cn } from "cn";
import { FileTextIcon } from "lucide-react";

export type SheetOption = {
  key: string;
  drawing: string;
  sheet: string;
  title?: string | null;
  /** What the sheet shows ("2 bandejas", "Bandera de la sección 014"…). */
  detail: string;
  /** Highlighted in amber: where the loose end waits, or a sheet that marks the tray. */
  accent?: string | null;
  /** Not drawn yet: listed, without image. */
  missingImage?: boolean;
};

/** "HLB-SNRELE-DRW-0021" → "DRW-0021": enough to tell two sheets with the same number apart. */
const shortDrawing = (drawing: string) => drawing.split("-").slice(-2).join("-");

/**
 * The sheets of the drawings that show something, to choose the one in the viewer. Titled and
 * small buttons in one row, with a line under them saying what the chosen sheet shows.
 */
export function SheetPicker({
  sheets,
  selected,
  onSelect,
  label,
}: {
  sheets: SheetOption[];
  selected: number;
  onSelect: (index: number) => void;
  /** "Hojas del recorrido", "Hojas donde aparece". */
  label: string;
}) {
  const current = sheets[selected];
  if (!current) return null;

  if (sheets.length === 1) return <SheetLine sheet={current} withNumber />;

  return (
    <div className="space-y-1.5">
      {/* Botones pequeños en una sola fila (de lado si no caben): el plano queda justo debajo. */}
      <div
        role="group"
        aria-label={label}
        className="-mx-4 flex [scrollbar-width:none] gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {sheets.map((item, index) => {
          const active = index === selected;
          return (
            <button
              key={item.key}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(index)}
              className={cn(
                "focus-visible:ring-ring/50 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card text-foreground hover:bg-muted",
                item.missingImage && !active && "text-muted-foreground",
              )}
            >
              Hoja {item.sheet}
              <span className="font-mono opacity-80">{shortDrawing(item.drawing)}</span>
              {item.accent ? (
                <span aria-label={item.accent} className="bg-warning size-2 rounded-full" />
              ) : null}
            </button>
          );
        })}
      </div>
      <SheetLine sheet={current} />
    </div>
  );
}

/**
 * One line about the sheet in view: what it shows first (trays, the loose end), then which
 * drawing it is; what does not fit is cut, the full text is in its tooltip.
 */
function SheetLine({ sheet, withNumber = false }: { sheet: SheetOption; withNumber?: boolean }) {
  const text = [
    withNumber ? `Hoja ${sheet.sheet}` : null,
    sheet.detail,
    sheet.accent,
    sheet.drawing,
    sheet.title,
    sheet.missingImage ? "sin imagen todavía" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <p title={text} className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <FileTextIcon aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">
        {withNumber ? (
          <span className="text-foreground font-medium">Hoja {sheet.sheet} · </span>
        ) : null}
        <span className="text-foreground">{sheet.detail}</span>
        {sheet.accent ? <span className="text-warning font-medium"> · {sheet.accent}</span> : null}
        {` · ${sheet.drawing}`}
        {sheet.title ? ` · ${sheet.title}` : ""}
        {sheet.missingImage ? " · sin imagen todavía" : ""}
      </span>
    </p>
  );
}
