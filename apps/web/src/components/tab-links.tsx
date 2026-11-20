import { cn } from "cn";
import Link from "next/link";
import { ChipRow } from "./chip-row";

/**
 * The look of a pill tab (fase 17: one place for the four copies it had): the chosen one filled
 * with the main colour, the rest in grey.
 */
export function tabChipClass(selected: boolean): string {
  return cn(
    "focus-visible:ring-ring/50 flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3",
    selected
      ? "bg-primary text-primary-foreground border-primary"
      : "bg-secondary text-foreground hover:bg-muted",
  );
}

/** The count inside a pill tab («Cambios 12»), in the colour of its tab. */
export function TabCount({ value, selected }: { value: string; selected: boolean }) {
  return (
    <span
      className={cn("tabular-nums", selected ? "text-primary-foreground" : "text-foreground/80")}
    >
      {value}
    </span>
  );
}

/**
 * Pill tabs that are links (each tab is its own URL): «Avance · Desviación · Bobinas»,
 * «Cambios · Nuevos · Discrepancias». On a phone the row scrolls sideways.
 */
export function TabLinks({
  label,
  tabs,
}: {
  /** What the row chooses, for screen readers («Qué ver»). */
  label: string;
  tabs: readonly { key: string; label: string; href: string; selected: boolean; count?: string }[];
}) {
  return (
    <ChipRow aria-label={label} className="-mx-4 gap-2 px-4 pb-1 sm:mx-0 sm:px-0">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.selected ? "page" : undefined}
          className={tabChipClass(tab.selected)}
        >
          {tab.label}
          {tab.count !== undefined ? <TabCount value={tab.count} selected={tab.selected} /> : null}
        </Link>
      ))}
    </ChipRow>
  );
}
