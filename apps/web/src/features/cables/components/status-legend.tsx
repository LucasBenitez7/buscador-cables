import { cn } from "cn";
import { TONE_BORDER, type StatusTone } from "@/features/cables/status-tones";

export type LegendItem = { tone: StatusTone; label: string };

/**
 * What each colour means, under a drawing or a list. The same squares and words everywhere,
 * so a colour learnt on the drawing reads the same in the route and on the badges.
 */
export function StatusLegend({ items, note }: { items: readonly LegendItem[]; note?: string }) {
  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
      {note ? <span>{note}</span> : null}
      {items.map((item) => (
        <span key={item.label} className="text-foreground inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("size-3.5 shrink-0 rounded-sm border-[3px]", TONE_BORDER[item.tone])}
          />
          {item.label}
        </span>
      ))}
    </p>
  );
}

/** The colours of a cable's route, on the drawings and in the list of trays. */
export const ROUTE_LEGEND: readonly LegendItem[] = [
  { tone: "laid", label: "Tendido" },
  { tone: "pending", label: "Falta o sin datos" },
  { tone: "partial", label: "Punta suelta" },
];
