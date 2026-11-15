/**
 * Where each kind of thing opens, so every page links them the same way: a location to its
 * page, an equipment or a level to the cables that have it, a tray to its record.
 */
import type { CableLevel } from "@cables/shared";

export const locationHref = (id: string) => `/locations/${encodeURIComponent(id)}`;

/** Cables that start, end or are in a location or anything it contains. */
export const locationCablesHref = (id: string) => `/cables?location=${encodeURIComponent(id)}`;

/** Cables that start or end at an equipment (exact tag). */
export const equipmentCablesHref = (equipment: string) =>
  `/cables?equipment=${encodeURIComponent(equipment)}`;

export const levelCablesHref = (level: CableLevel) => `/cables?level=${level}`;

export const trayHref = (code: string) => `/trays/${encodeURIComponent(code)}`;

/** Trays whose code contains this one (a building's trays start with its code). */
export const traysByCodeHref = (code: string) => `/trays?q=${encodeURIComponent(code)}`;

/** A quiet underlined link inside a line of text (a room, an equipment, a level). */
export const INLINE_LINK =
  "hover:text-primary focus-visible:ring-ring/50 rounded-sm underline decoration-muted-foreground/50 underline-offset-2 transition-colors outline-none hover:decoration-primary focus-visible:ring-3";
