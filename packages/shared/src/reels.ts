/**
 * Which reel each cable came from or is meant to come from (fase 18). Pure rules, shared by
 * the reel pages and the cable record, tested without a database.
 *
 * A cable names its reels in two fields of the Excel: the real one («Bobina usada», «Bobina
 * Real en campo») and the planned one. The electrical file names the warehouse tag; the
 * instrumentation one, the factory drum (the tag for the fibre). Both files number their tags
 * from 1, so a cable is only ever matched with the reels of its own file.
 */
import { z } from "zod";
import { reelIds, reelKey } from "./excel-reels";
import type { ExcelKind } from "./excel-status";
import type { CableLevel } from "./trays";
import { firstParams, pageSchema, pageSizeSchema, type RawSearchParams } from "./url-params";

/** The file a cable comes in, by its level: L1 is instrumentation, L2 to L4 electrical. */
export function excelKindOfLevel(level: CableLevel | null): ExcelKind | null {
  if (level === null) return null;
  return level === "L1" ? "INSTRUMENTATION" : "ELECTRICAL";
}

export type ReelRef = { id: string; kind: ExcelKind; drum: string | null; tag: string | null };

/** One name a cable gives, and the reels it is. */
export type ReelNameMatch = { name: string; reelIds: string[] };

/**
 * Finds the reels a cable names. In instrumentation, a planned reel may name one piece of a
 * drum with a letter («…A», «…B»): when nothing has that exact name, the drum without the
 * letter is the reel. A name that is several reels (two pieces of a drum keep its factory
 * name) gives them all: which one it was is not known.
 */
export function createReelMatcher(reels: readonly ReelRef[]) {
  const index = new Map<string, string[]>();
  const add = (kind: ExcelKind, field: "tag" | "drum", name: string | null, id: string) => {
    if (name === null) return;
    const key = `${kind}:${field}:${name}`;
    index.set(key, [...(index.get(key) ?? []), id]);
  };
  for (const reel of reels) {
    add(reel.kind, "tag", reel.tag, reel.id);
    add(reel.kind, "drum", reel.drum, reel.id);
  }
  const find = (kind: ExcelKind, field: "tag" | "drum", name: string) =>
    index.get(`${kind}:${field}:${name}`) ?? [];
  const order: Record<ExcelKind, readonly ("tag" | "drum")[]> = {
    ELECTRICAL: ["tag", "drum"],
    INSTRUMENTATION: ["drum", "tag"],
  };

  function one(kind: ExcelKind, name: string): string[] {
    for (const field of order[kind]) {
      const found = find(kind, field, name);
      if (found.length > 0) return found;
    }
    const piece = /^(.*\d)[A-Z]$/.exec(name);
    if (kind === "INSTRUMENTATION" && piece) {
      for (const field of order[kind]) {
        const found = find(kind, field, piece[1]!);
        if (found.length > 0) return found;
      }
    }
    return [];
  }

  return function match(kind: ExcelKind | null, value: string | null): ReelNameMatch[] {
    if (kind === null) return [];
    return reelIds(value).map((name) => ({ name, reelIds: [...new Set(one(kind, name))] }));
  };
}

export type ReelMatcher = ReturnType<typeof createReelMatcher>;

// ---------------------------------------------------------------------------
// What a reel gave
// ---------------------------------------------------------------------------

/** A pulling as the reel pages need it (see `excelReelPullSchema`). */
export type ReelPullRef = {
  id: string;
  kind: ExcelKind;
  row: number;
  code: string;
  conductor: string | null;
  circuit: number | null;
  tag: string | null;
  drum: string | null;
  startM: number | null;
  endM: number | null;
  pulledM: number | null;
  pulledOn: Date | null;
};

/**
 * Finds the reel of each pulling: the one with its key (`reelKey`); otherwise the only reel of
 * its file with its tag, or with its drum. In instrumentation a piece of a lot («…NEA») is the
 * lot when nothing has that exact name. Null when no reel, or several, could be it.
 */
export function createPullReelFinder(reels: readonly (ReelRef & { key: string })[]) {
  const byKey = new Map<string, string>();
  const by = new Map<string, string[]>();
  const add = (key: string, id: string) => by.set(key, [...(by.get(key) ?? []), id]);
  for (const reel of reels) {
    byKey.set(`${reel.kind}:${reel.key}`, reel.id);
    if (reel.tag !== null) add(`${reel.kind}:tag:${reel.tag}`, reel.id);
    if (reel.drum !== null) add(`${reel.kind}:drum:${reel.drum}`, reel.id);
  }
  const only = (key: string) => {
    const found = by.get(key) ?? [];
    return found.length === 1 ? found[0]! : null;
  };
  const byName = (kind: ExcelKind, tag: string | null, drum: string | null) =>
    (tag === null ? null : only(`${kind}:tag:${tag}`)) ??
    (drum === null ? null : only(`${kind}:drum:${drum}`));

  return function find(pull: Pick<ReelPullRef, "kind" | "tag" | "drum">): string | null {
    const exact = byKey.get(`${pull.kind}:${reelKey(pull.kind, pull)}`);
    if (exact !== undefined) return exact;
    const found = byName(pull.kind, pull.tag, pull.drum);
    if (found !== null || pull.kind !== "INSTRUMENTATION") return found;
    const piece = (name: string | null) =>
      name === null ? null : (/^(.*\d)[A-Z]$/.exec(name)?.[1] ?? null);
    const tag = piece(pull.tag);
    const drum = piece(pull.drum);
    return tag === null && drum === null ? null : byName(pull.kind, tag, drum);
  };
}

/**
 * The cable of the web a pulling is: the section of its circuit (the electrical file names the
 * circuit and the core «…T3C2», the web has the sections «….1», «….2»), or else the one with
 * its code. A section the web does not have is no cable: never another section.
 */
export function pullCableCode(
  pull: Pick<ReelPullRef, "code" | "circuit">,
  exists: (code: string) => boolean,
): string | null {
  if (pull.circuit !== null && exists(`${pull.code}.${pull.circuit}`)) {
    return `${pull.code}.${pull.circuit}`;
  }
  if (exists(pull.code)) return pull.code;
  return null;
}

/** A cable as the reel pages need it. */
export type ReelCable = {
  id: string;
  code: string;
  kind: ExcelKind | null;
  installationStatus: string;
  plannedReel: string | null;
  /** Metres of each of its cables in the list. */
  lengthM: number | null;
  /** Cables laid side by side in this record (a section of 3 single cores): 1 if unknown. */
  cablesPerCircuit: number | null;
};

/** A cable still to pull from a reel. */
export type ReelPendingEntry = {
  cable: ReelCable;
  /** Cables of the record: each one is a pulling. */
  pulls: number;
  /** Metres of the list for all of them; null when the list has none. */
  metres: number | null;
  /** Its planned name is several reels (pieces of one drum): it may be for another one. */
  sharedName: boolean;
};

const TO_LAY = new Set(["NOT_LAID", "UNVERIFIED"]);

/**
 * The cables still to pull from each reel: not laid, and planned for it. A cable already
 * pulled (it has a pulling in the Excel) is not pending, whatever its state in the web.
 */
export function pendingByReel(
  matcher: ReelMatcher,
  cables: readonly ReelCable[],
  pulled: ReadonlySet<string>,
): Map<string, ReelPendingEntry[]> {
  const pending = new Map<string, ReelPendingEntry[]>();
  for (const cable of cables) {
    if (!TO_LAY.has(cable.installationStatus) || pulled.has(cable.code)) continue;
    const matches = matcher(cable.kind, cable.plannedReel);
    for (const id of new Set(matches.flatMap((match) => match.reelIds))) {
      const pulls = Math.max(1, cable.cablesPerCircuit ?? 1);
      pending.set(id, [
        ...(pending.get(id) ?? []),
        {
          cable,
          pulls,
          metres: cable.lengthM === null ? null : Math.round(cable.lengthM * pulls * 100) / 100,
          sharedName: matches.some(
            (match) => match.reelIds.includes(id) && match.reelIds.length > 1,
          ),
        },
      ]);
    }
  }
  return pending;
}

/** What the Excel's pullings and the pending cables add up to for a reel. */
export type ReelTotals = {
  pulls: number;
  usedM: number;
  /** Pullings without metres: left out of `usedM`. */
  withoutMetres: number;
  pendingPulls: number;
  pendingM: number;
};

export function reelTotals(
  pulls: readonly Pick<ReelPullRef, "pulledM">[],
  pending: readonly ReelPendingEntry[],
): ReelTotals {
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    pulls: pulls.length,
    usedM: round(pulls.reduce((sum, pull) => sum + (pull.pulledM ?? 0), 0)),
    withoutMetres: pulls.filter((pull) => pull.pulledM === null).length,
    pendingPulls: pending.reduce((sum, item) => sum + item.pulls, 0),
    pendingM: round(pending.reduce((sum, item) => sum + (item.metres ?? 0), 0)),
  };
}

// ---------------------------------------------------------------------------
// The state of a reel
// ---------------------------------------------------------------------------

export const REEL_STATES = ["available", "empty", "review"] as const;
export type ReelState = (typeof REEL_STATES)[number];

export const REEL_STATE_LABELS: Record<ReelState, string> = {
  available: "Con metros",
  empty: "Agotada",
  review: "Revisar",
};

/**
 * With metres left, used up, or to check: more used than received (the Excel says so with
 * metres left below zero). Null when the metres left are not known.
 */
export function reelState(remainingM: number | null): ReelState | null {
  if (remainingM === null) return null;
  if (remainingM < 0) return "review";
  return remainingM === 0 ? "empty" : "available";
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

export const REEL_PAGE_SIZES = [50, 100] as const;

export const REEL_KIND_LABELS: Record<ExcelKind, string> = {
  ELECTRICAL: "Eléctrico",
  INSTRUMENTATION: "Instrumentación",
};

export const REEL_SORTS = ["name", "remaining", "remaining-asc", "pending"] as const;
export type ReelSort = (typeof REEL_SORTS)[number];
export const REEL_SORT_LABELS: Record<ReelSort, string> = {
  name: "Bobina (A-Z)",
  remaining: "Más metros restantes primero",
  "remaining-asc": "Menos metros restantes primero",
  pending: "Más tiradas pendientes primero",
};

const optionalText = z
  .string()
  .trim()
  .max(100)
  .transform((value) => (value === "" ? undefined : value))
  .optional()
  .catch(undefined);

const reelsSearchSchema = z.object({
  q: optionalText,
  kind: z.enum(["ELECTRICAL", "INSTRUMENTATION"]).optional().catch(undefined),
  state: z.enum(REEL_STATES).optional().catch(undefined),
  sort: z.enum(REEL_SORTS).optional().catch(undefined),
  page: pageSchema,
  size: pageSizeSchema(REEL_PAGE_SIZES),
});
export type ReelsSearch = z.infer<typeof reelsSearchSchema>;

/** The search of «Bobinas» from the URL; anything unknown falls back to its default. */
export function parseReelsSearch(params: RawSearchParams): ReelsSearch {
  return reelsSearchSchema.parse(firstParams(params));
}

/** Query string for the links of the list, without empty values or the defaults. */
export function reelsQuery(search: ReelsSearch, overrides: Partial<ReelsSearch> = {}): string {
  const { q, kind, state, sort, page, size } = { ...search, ...overrides };
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (kind) params.set("kind", kind);
  if (state) params.set("state", state);
  if (sort && sort !== "name") params.set("sort", sort);
  if (page && page > 1) params.set("page", String(page));
  if (size && size !== REEL_PAGE_SIZES[0]) params.set("size", String(size));
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** «  Bobina  Ñ-12 » → «bobina n-12»: how the search compares texts. */
export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
