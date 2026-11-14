import { z } from "zod";
import { CABLE_ACTIONS, CONNECTION_STATUSES, INSTALLATION_STATUSES, TEST_STATUSES } from "./cables";
import { CABLE_LEVELS, normalizeTrayCode } from "./trays";
import {
  daySchema as day,
  firstParams,
  pageSchema,
  pageSizeSchema,
  type RawSearchParams,
} from "./url-params";

/**
 * Cable search filters as they travel in the URL (`/cables?q=sh50&type=…`).
 *
 * URLs are shared and edited by hand, so an invalid value is ignored instead of
 * failing the whole search. Numbers accept a decimal comma ("2,5").
 */
export const CABLE_SORTS = [
  "relevance",
  "code",
  "updated",
  "activity",
  "length",
  "section",
] as const;
export type CableSort = (typeof CABLE_SORTS)[number];

export const CABLE_SORT_LABELS: Record<CableSort, string> = {
  relevance: "Relevancia",
  code: "Código",
  updated: "Última modificación",
  activity: "Último movimiento",
  length: "Longitud",
  section: "Sección",
};

export const SEARCH_PAGE_SIZE = 25;
/** Page sizes the cable search offers; the first one is the default. */
export const SEARCH_PAGE_SIZES = [SEARCH_PAGE_SIZE, 50, 100] as const;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? undefined : value))
    .optional()
    .catch(undefined);

const id = text(64);

const decimal = z
  .string()
  .trim()
  .regex(/^\d+([.,]\d+)?$/)
  .transform((value) => Number(value.replace(",", ".")))
  .pipe(z.number().max(1_000_000))
  .optional()
  .catch(undefined);

export const cableSearchSchema = z.object({
  q: text(50),
  location: id,
  type: id,
  color: id,
  manufacturer: id,
  installation: z.enum(INSTALLATION_STATUSES).optional().catch(undefined),
  connection: z.enum(CONNECTION_STATUSES).optional().catch(undefined),
  /** Timbrado. */
  test: z.enum(TEST_STATUSES).optional().catch(undefined),
  level: z.enum(CABLE_LEVELS).optional().catch(undefined),
  /** Cables that start or end at this equipment, exactly ("+80BBA01"). */
  equipment: text(80),
  /** Cables whose route goes through this tray (or, with `loose`, waiting in it). */
  tray: z
    .string()
    .trim()
    .max(50)
    .transform((value) => (value === "" ? undefined : normalizeTrayCode(value)))
    .optional()
    .catch(undefined),
  /** "1": only cables with a loose end (in `tray`, if given). */
  loose: z.literal("1").optional().catch(undefined),
  sectionMin: decimal,
  sectionMax: decimal,
  diameterMin: decimal,
  diameterMax: decimal,
  lengthMin: decimal,
  lengthMax: decimal,
  // Movimientos: cables con algún evento de esa persona, de esa acción y en esas fechas
  // ("cables que conectó Juan esta semana"). Se combinan sobre el mismo evento.
  actor: id,
  action: z.enum(CABLE_ACTIONS).optional().catch(undefined),
  from: day,
  to: day,
  sort: z.enum(CABLE_SORTS).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
  page: pageSchema,
  size: pageSizeSchema(SEARCH_PAGE_SIZES),
});

export type CableSearch = z.infer<typeof cableSearchSchema>;

/** Parses Next.js `searchParams` (repeated keys keep the first value). */
export function parseCableSearch(params: RawSearchParams): CableSearch {
  return cableSearchSchema.parse(firstParams(params));
}

/** Sort actually applied: relevance only makes sense with a text query. */
export function effectiveSort(search: CableSearch): { sort: CableSort; dir: "asc" | "desc" } {
  const sort = search.sort ?? (search.q ? "relevance" : "code");
  if (sort === "relevance" && !search.q) {
    return { sort: "code", dir: search.dir ?? "asc" };
  }
  const defaultDir = sort === "updated" || sort === "activity" ? "desc" : "asc";
  return { sort, dir: search.dir ?? defaultDir };
}

/** Query string for links (pagination, sorting), without empty values. */
export function cableSearchQuery(
  search: CableSearch,
  overrides: Partial<CableSearch> = {},
): string {
  const merged = { ...search, ...overrides };
  const params = new URLSearchParams();
  for (const key of Object.keys(cableSearchSchema.shape) as (keyof CableSearch)[]) {
    const value = merged[key];
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if ((key === "page" && value === 1) || (key === "size" && value === SEARCH_PAGE_SIZE)) {
      continue;
    }
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** True when any of the "who / what / when" filters is set. */
export function hasActivityFilters(search: CableSearch): boolean {
  return Boolean(search.actor || search.action || search.from || search.to);
}

/** True when any filter (not paging or sorting) is set. */
export function hasActiveFilters(search: CableSearch): boolean {
  const { sort: _sort, dir: _dir, page: _page, size: _size, ...filters } = search;
  return Object.values(filters).some((value) => value !== undefined);
}
