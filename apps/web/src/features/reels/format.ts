import { REEL_STATE_LABELS, type ReelState } from "@cables/shared";

const decimals = new Intl.NumberFormat("es-ES", {
  maximumFractionDigits: 2,
  useGrouping: "always",
});

/** «1.050 m», «−42 m», «52,5 m»; null when the metres are not known. */
export function metresText(value: number | null): string | null {
  if (value === null) return null;
  return `${decimals.format(value).replace("-", "−")} m`;
}

/** «14 tiradas», «1 tirada». */
export function pullsText(count: number): string {
  return `${decimals.format(count)} ${count === 1 ? "tirada" : "tiradas"}`;
}

/** The badge of a reel that needs looking at: used up, or more used than received. */
export const REEL_STATE_BADGE: Record<
  ReelState,
  { label: string; variant: "default" | "warning" | null }
> = {
  available: { label: REEL_STATE_LABELS.available, variant: null },
  empty: { label: REEL_STATE_LABELS.empty, variant: "default" },
  review: { label: REEL_STATE_LABELS.review, variant: "warning" },
};
