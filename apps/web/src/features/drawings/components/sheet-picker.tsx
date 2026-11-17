"use client";

import { cn } from "cn";
import { CheckIcon, FileTextIcon } from "lucide-react";

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

/**
 * The sheets of the drawings that show something, to choose the one in the viewer. Titled and
 * counted so it reads as what it is. On a phone, a row of cards that scrolls sideways (one
 * hand, no wrapping into a wall of buttons); from `sm` on, a grid.
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

  if (sheets.length === 1) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <FileTextIcon aria-hidden className="size-4 shrink-0" />
        <span>
          Plano <span className="text-foreground font-mono">{current.drawing}</span> · hoja{" "}
          <span className="text-foreground font-medium">{current.sheet}</span>
          {current.title ? ` · ${current.title}` : ""}
        </span>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">
          {label} <span className="text-muted-foreground font-normal">({sheets.length})</span>
        </h3>
        <p className="text-muted-foreground hidden text-xs sm:block">
          Elige la hoja que quieres ver
        </p>
      </div>
      <div
        role="group"
        aria-label={label}
        className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3"
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
                "focus-visible:ring-ring/50 relative flex w-44 shrink-0 snap-start flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors outline-none focus-visible:ring-3 sm:w-auto",
                active
                  ? "border-primary bg-primary/10"
                  : "bg-card hover:bg-muted/60 hover:border-muted-foreground/40",
              )}
            >
              {active ? (
                <CheckIcon aria-hidden className="text-primary absolute top-2 right-2 size-4" />
              ) : null}
              <span className={cn("text-base font-semibold", active && "text-primary")}>
                Hoja {item.sheet}
              </span>
              <span className="text-muted-foreground w-full truncate font-mono text-xs">
                {item.drawing}
              </span>
              {item.title ? (
                <span className="text-muted-foreground w-full truncate text-xs">{item.title}</span>
              ) : null}
              <span className="text-xs">{item.detail}</span>
              {item.accent ? (
                <span className="text-warning text-xs font-medium">{item.accent}</span>
              ) : null}
              {item.missingImage ? (
                <span className="text-muted-foreground text-xs italic">Sin imagen todavía</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
