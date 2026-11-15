/**
 * Cable levels, tray kinds and the codification of trays used in the project
 * drawings. See docs/DATOS-PROYECTO.md.
 */

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

export type TraySearch = { q?: string; page?: number; size?: number };

/** `/trays?q=…&page=…&size=…`: invalid values are ignored, like the cable search. */
export function parseTraySearch(params: Record<string, string | string[] | undefined>): TraySearch {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const q = first(params.q)?.trim();
  const page = Number(first(params.page));
  const size = Number(first(params.size));
  return {
    ...(q && q.length <= 50 ? { q: normalizeTrayCode(q) } : {}),
    ...(Number.isInteger(page) && page >= 1 && page <= 10_000 ? { page } : {}),
    ...((TRAY_PAGE_SIZES as readonly number[]).includes(size) ? { size } : {}),
  };
}

/** Query string for tray list links, without empty values, page 1 or the default size. */
export function trayQuery(search: TraySearch, overrides: Partial<TraySearch> = {}): string {
  const { q, page, size } = { ...search, ...overrides };
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page && page > 1) params.set("page", String(page));
  if (size && size !== TRAY_PAGE_SIZE) params.set("size", String(size));
  const query = params.toString();
  return query ? `?${query}` : "";
}
