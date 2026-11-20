/**
 * Real metres against the planned ones (fase 17): how far a cable, an area or a level is from
 * what the list said. A big gap points to a measuring mistake or a different route.
 */

/** Up to this (±%) the real length agrees with the list. */
export const DEVIATION_OK_PERCENT = 10;
/** Above this (±%) it should be checked: a wrong measure or another route. */
export const DEVIATION_REVIEW_PERCENT = 25;

export type DeviationLevel = "ok" | "warning" | "review";

export const DEVIATION_LEVEL_LABELS: Record<DeviationLevel, string> = {
  ok: "Dentro de lo previsto",
  warning: "Se desvía",
  review: "Revisar",
};

/** Metres and percent the real length is off the planned one; null when either is missing. */
export function lengthDeviation(
  planned: number | null,
  actual: number | null,
): { metres: number; percent: number } | null {
  if (planned === null || actual === null || planned <= 0) return null;
  const metres = actual - planned;
  return { metres, percent: (metres / planned) * 100 };
}

/** How serious a deviation is, by its size and not its sign. */
export function deviationLevel(percent: number): DeviationLevel {
  const size = Math.abs(percent);
  if (size <= DEVIATION_OK_PERCENT) return "ok";
  return size <= DEVIATION_REVIEW_PERCENT ? "warning" : "review";
}

const decimals = (digits: number) =>
  new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
    useGrouping: "always",
  });

/** "+5 %", "−12 %", "0 %": with its sign, rounded to whole percents. */
export function percentText(percent: number): string {
  const rounded = Math.round(percent);
  if (rounded === 0) return "0 %";
  return `${rounded > 0 ? "+" : "−"}${decimals(0).format(Math.abs(rounded))} %`;
}

/** "+8 m", "−120 m": the gap in metres, with its sign. */
export function signedMetresText(metres: number): string {
  const rounded = Math.round(metres);
  if (rounded === 0) return "0 m";
  return `${rounded > 0 ? "+" : "−"}${decimals(0).format(Math.abs(rounded))} m`;
}

/** "404 km" from 1 km on, "850 m" below: long totals read better in kilometres. */
export function distanceText(metres: number): string {
  if (Math.abs(metres) >= 1000) return `${decimals(1).format(metres / 1000)} km`;
  return `${decimals(0).format(metres)} m`;
}
