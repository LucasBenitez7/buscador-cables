/**
 * Cable levels, tray kinds and the codification of trays used in the project
 * drawings. See docs/DATOS-PROYECTO.md.
 */

import { z } from "zod";
import { firstParams, pageSizeSchema, pageSchema, type RawSearchParams } from "./url-params";

/** The Prisma enums must list exactly the same members. */
export const CABLE_LEVELS = ["L1", "L2", "L3", "L4"] as const;
export const TRAY_KINDS = ["LADDER", "GRID", "SPECIAL", "CONDUIT", "DUCT", "OTHER"] as const;
export const ROUTE_SECTIONS = ["FIELD", "ROOM"] as const;

export type CableLevel = (typeof CABLE_LEVELS)[number];
export type TrayKind = (typeof TRAY_KINDS)[number];
export type RouteSection = (typeof ROUTE_SECTIONS)[number];

export const CABLE_LEVEL_LABELS: Record<CableLevel, string> = {
  L1: "L1 · Instrumentación",
  L2: "L2 · BT fuerza y control",
  L3: "L3 · BT unipolar",
  L4: "L4 · Media tensión",
};

export const TRAY_KIND_LABELS: Record<TrayKind, string> = {
  LADDER: "Bandeja de escalera",
  GRID: "Bandeja de rejilla",
  SPECIAL: "Bandeja especial",
  CONDUIT: "Tubo",
  DUCT: "Canalización enterrada",
  OTHER: "Otro tramo",
};

export const ROUTE_SECTION_LABELS: Record<RouteSection, string> = {
  FIELD: "Campo",
  ROOM: "Sala",
};

const KIND_BY_LETTER: Record<string, TrayKind> = {
  L: "LADDER",
  W: "GRID",
  S: "SPECIAL",
  C: "CONDUIT",
  D: "DUCT",
};

/**
 * unit (2 digits) · area (3, may end in "_") · sub-zone (2) · kind letter ·
 * voltage level · elevation · order number (3-4 digits). "99UXA00L22036".
 */
const TRAY_CODE = /^(\d{2})([A-Z][A-Z_]{2})([0-9_][0-9])([A-Z])(\d)(\d)(\d{3,4})$/;

export type ParsedTrayCode = {
  code: string;
  kind: TrayKind;
  voltageLevel: number;
  elevationLevel: number;
  /** Unit + area without the padding "_": "99UXA", "99UM". */
  areaCode: string;
  orderNumber: string;
};

/** Normalizes spacing and case; trays keep their "_" (it is part of the code). */
export function normalizeTrayCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

/** Parses a tray, conduit or duct code, or returns null if it does not follow the codification. */
export function parseTrayCode(input: string): ParsedTrayCode | null {
  const code = normalizeTrayCode(input);
  const match = TRAY_CODE.exec(code);
  if (!match) return null;
  const [, unit, area, , letter, voltage, elevation, order] = match;
  const voltageLevel = Number(voltage);
  if (voltageLevel < 1 || voltageLevel > 4) return null;
  return {
    code,
    kind: KIND_BY_LETTER[letter!] ?? "OTHER",
    voltageLevel,
    elevationLevel: Number(elevation),
    areaCode: `${unit}${trimTrailingUnderscores(area!)}`,
    orderNumber: order!,
  };
}

/** "UX_" → "UX". Without a regular expression: no backtracking on long inputs. */
function trimTrailingUnderscores(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "_") end -= 1;
  return value.slice(0, end);
}

export function isTrayCode(input: string): boolean {
  return parseTrayCode(input) !== null;
}

export type TraySize = {
  widthMm?: number;
  flangeHeightMm?: number;
  bendRadiusMm?: number;
  diameterMm?: number;
};

/**
 * Size code next to the tray in the electrical drawings:
 * "L600100300" → width 600, flange 100, bend radius 300; "C025" / "D160" → diameter.
 */
export function parseTraySize(input: string): TraySize | null {
  const value = input.trim().toUpperCase().replace(/\s+/g, "");
  const tray = /^[LSW](\d{3})(\d{3})(\d{3})$/.exec(value);
  if (tray) {
    return {
      widthMm: Number(tray[1]),
      flangeHeightMm: Number(tray[2]),
      bendRadiusMm: Number(tray[3]),
    };
  }
  const tube = /^[CD](\d{3})$/.exec(value);
  if (tube) return { diameterMm: Number(tube[1]) };
  return null;
}

/** "600 × 100 mm, radio 300 mm" for trays, "Ø 25 mm" for conduits and ducts, null if unknown. */
export function formatTraySize(size: {
  widthMm: number | null;
  flangeHeightMm: number | null;
  bendRadiusMm: number | null;
  diameterMm: number | null;
}): string | null {
  if (size.diameterMm) return `Ø ${size.diameterMm} mm`;
  if (!size.widthMm) return null;
  const section = size.flangeHeightMm
    ? `${size.widthMm} × ${size.flangeHeightMm} mm`
    : `${size.widthMm} mm de ancho`;
  return size.bendRadiusMm ? `${section}, radio ${size.bendRadiusMm} mm` : section;
}

export const TRAY_PAGE_SIZE = 60;
/** Page sizes the tray list offers (multiples of 3, it is a three-column grid). */
export const TRAY_PAGE_SIZES = [TRAY_PAGE_SIZE, 120, 240] as const;

/** Orders of the tray list. The default is by code, A-Z. */
export const TRAY_SORTS = ["code", "code-desc", "waiting"] as const;
export type TraySort = (typeof TRAY_SORTS)[number];
export const TRAY_SORT_LABELS: Record<TraySort, string> = {
  code: "Código (A-Z)",
  "code-desc": "Código (Z-A)",
  waiting: "Más cables esperando primero",
};

export type TraySearch = {
  q?: string;
  kind?: TrayKind;
  /** Voltage level of the code (1-4, "L1"…"L4"). */
  level?: number;
  /** Only trays where some active cable waits with its loose end. */
  waiting?: boolean;
  sort?: TraySort;
  page?: number;
  size?: number;
};

const traySearchSchema = z.object({
  q: z
    .string()
    .trim()
    .max(50)
    .transform((value) => (value === "" ? undefined : normalizeTrayCode(value)))
    .optional()
    .catch(undefined),
  kind: z.enum(TRAY_KINDS).optional().catch(undefined),
  level: z.coerce.number().int().min(1).max(4).optional().catch(undefined),
  waiting: z
    .literal("1")
    .transform(() => true)
    .optional()
    .catch(undefined),
  sort: z.enum(TRAY_SORTS).optional().catch(undefined),
  page: pageSchema,
  size: pageSizeSchema(TRAY_PAGE_SIZES),
});

/**
 * `/trays?q=…&kind=…&level=…&waiting=1&sort=…&page=…&size=…`. Like the cable search, an invalid
 * value is ignored instead of failing the page, so a shared or hand-edited link always opens.
 */
export function parseTraySearch(params: RawSearchParams): TraySearch {
  const parsed = traySearchSchema.parse(firstParams(params));
  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => value !== undefined),
  ) as TraySearch;
}

/**
 * Query string for tray list links, without empty values or the defaults (page 1, the default
 * size and order).
 */
export function trayQuery(search: TraySearch, overrides: Partial<TraySearch> = {}): string {
  const { q, kind, level, waiting, sort, page, size } = { ...search, ...overrides };
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (kind) params.set("kind", kind);
  if (level) params.set("level", String(level));
  if (waiting) params.set("waiting", "1");
  if (sort && sort !== "code") params.set("sort", sort);
  if (page && page > 1) params.set("page", String(page));
  if (size && size !== TRAY_PAGE_SIZE) params.set("size", String(size));
  const query = params.toString();
  return query ? `?${query}` : "";
}
