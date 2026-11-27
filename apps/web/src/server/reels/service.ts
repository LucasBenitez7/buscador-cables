import "server-only";
import { prisma, type ExcelKind, type Prisma } from "@cables/db";
import {
  REEL_PAGE_SIZES,
  createPullReelFinder,
  createReelMatcher,
  excelKindOfLevel,
  normalizeText,
  pendingByReel,
  pullCableCode,
  reelState,
  reelTotals,
  type CableLevel,
  type ReelCable,
  type ReelPendingEntry,
  type ReelPullRef,
  type ReelState,
  type ReelTotals,
  type ReelsSearch,
} from "@cables/shared";

/**
 * «Bobinas» (fase 18): the reels of the Excel of the day, the pullings written down for each
 * one and the cables still to pull. Everything is matched when the page is asked for: it all
 * changes with every Excel, and a few thousand rows take milliseconds.
 */

const toNumber = (value: Prisma.Decimal | null) => (value === null ? null : Number(value));

const REEL_SELECT = {
  id: true,
  kind: true,
  key: true,
  drum: true,
  tag: true,
  code: true,
  request: true,
  description: true,
  voltage: true,
  pickedUpOn: true,
  receivedM: true,
  usedM: true,
  remainingM: true,
  pulls: true,
  pendingPulls: true,
  pendingM: true,
  otherM: true,
  deliveredOn: true,
  deliveredM: true,
  tracked: true,
  pieces: true,
  excelDate: true,
} satisfies Prisma.ReelSelect;

type ReelRecord = Prisma.ReelGetPayload<{ select: typeof REEL_SELECT }>;

const loadReels = (where: Prisma.ReelWhereInput = {}) =>
  prisma.reel.findMany({ where, select: REEL_SELECT });

/** The pullings of the applied Excel files: a preview does not count until it is applied. */
async function loadPulls(kind?: ExcelKind): Promise<ReelPullRef[]> {
  const rows = await prisma.reelPull.findMany({
    where: { ...(kind ? { kind } : {}), import: { status: "APPLIED" } },
    orderBy: { row: "asc" },
    select: {
      id: true,
      kind: true,
      row: true,
      code: true,
      conductor: true,
      circuit: true,
      tag: true,
      drum: true,
      startM: true,
      endM: true,
      pulledM: true,
      pulledOn: true,
    },
  });
  return rows.map((row) => ({
    ...row,
    startM: toNumber(row.startM),
    endM: toNumber(row.endM),
    pulledM: toNumber(row.pulledM),
  }));
}

/**
 * The cables of the web: their codes (a pulling names one) and what a pending one needs. The
 * file of a cable comes from its level; one without a level (created by the Excel) takes the
 * file of its last Excel event.
 */
async function loadCables(): Promise<ReelCable[]> {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      code: string;
      level: CableLevel | null;
      excel_kind: ExcelKind | null;
      installationStatus: string;
      plannedReel: string | null;
      lengthM: Prisma.Decimal | null;
      cablesPerCircuit: number | null;
    }[]
  >`
    SELECT c."id", c."code", c."level", c."installationStatus"::text AS "installationStatus",
      c."plannedReel", c."lengthM", c."cablesPerCircuit",
      CASE WHEN c."level" IS NULL THEN (
        SELECT i."kind" FROM cable_event e JOIN excel_import i ON i."id" = e."excelImportId"
        WHERE e."cableId" = c."id" ORDER BY e."createdAt" DESC LIMIT 1
      ) END AS excel_kind
    FROM cable c
    WHERE c."deletedAt" IS NULL
    ORDER BY c."code"`;
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    kind: excelKindOfLevel(row.level) ?? row.excel_kind,
    installationStatus: row.installationStatus,
    plannedReel: row.plannedReel,
    lengthM: toNumber(row.lengthM),
    cablesPerCircuit: row.cablesPerCircuit,
  }));
}

/** A pulling with the cable of the web it is, when there is one. */
export type ReelPullEntry = ReelPullRef & { cable: { id: string; code: string } | null };

type Matched = {
  pulls: Map<string, ReelPullEntry[]>;
  pending: Map<string, ReelPendingEntry[]>;
};

/** The pullings and the pending cables of each reel. */
function matchAll(reels: ReelRecord[], pulls: ReelPullRef[], cables: ReelCable[]): Matched {
  const byCode = new Map(cables.map((cable) => [cable.code, cable]));
  const find = createPullReelFinder(reels);
  const byReel = new Map<string, ReelPullEntry[]>();
  const pulledCodes = new Set<string>();
  for (const pull of pulls) {
    const code = pullCableCode(pull, (value) => byCode.has(value));
    if (code !== null) pulledCodes.add(code);
    const reelId = find(pull);
    if (reelId === null) continue;
    const cable = code === null ? null : byCode.get(code)!;
    byReel.set(reelId, [
      ...(byReel.get(reelId) ?? []),
      { ...pull, cable: cable ? { id: cable.id, code: cable.code } : null },
    ]);
  }
  return {
    pulls: byReel,
    pending: pendingByReel(createReelMatcher(reels), cables, pulledCodes),
  };
}

/** What the reel pages show of its metres and pullings. */
export type ReelFigures = {
  receivedM: number | null;
  usedM: number | null;
  remainingM: number | null;
  pulls: number | null;
  pendingPulls: number | null;
  pendingM: number | null;
  /** From the follow-up sheet, or worked out from the pullings when it does not track it. */
  source: "excel" | "pulls";
};

/**
 * The figures of the follow-up when it tracks the reel. Otherwise the app works them out: what
 * it received (stock list) less the metres of its pullings, and the cables still to pull.
 */
function figuresOf(reel: ReelRecord, totals: ReelTotals): ReelFigures {
  if (reel.tracked) {
    return {
      receivedM: toNumber(reel.receivedM),
      usedM: toNumber(reel.usedM),
      remainingM: toNumber(reel.remainingM),
      pulls: reel.pulls,
      pendingPulls: reel.pendingPulls,
      pendingM: toNumber(reel.pendingM),
      source: "excel",
    };
  }
  const receivedM = toNumber(reel.receivedM);
  return {
    receivedM,
    usedM: totals.usedM,
    remainingM: receivedM === null ? null : Math.round((receivedM - totals.usedM) * 100) / 100,
    pulls: totals.pulls,
    pendingPulls: totals.pendingPulls,
    pendingM: totals.pendingM,
    source: "pulls",
  };
}

export type ReelListItem = {
  id: string;
  kind: ExcelKind;
  drum: string | null;
  tag: string | null;
  request: string | null;
  description: string | null;
  figures: ReelFigures;
  state: ReelState | null;
};

export type ReelListResult = {
  items: ReelListItem[];
  total: number;
  page: number;
  pageCount: number;
  /** The day of the Excel the reels come from, per file. */
  excelDates: { kind: ExcelKind; day: Date }[];
};

const natural = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

function sortItems(items: ReelListItem[], sort: ReelsSearch["sort"]) {
  const byName = (a: ReelListItem, b: ReelListItem) =>
    a.kind.localeCompare(b.kind) ||
    natural.compare(a.tag ?? a.drum ?? "", b.tag ?? b.drum ?? "") ||
    natural.compare(a.drum ?? "", b.drum ?? "");
  // Las que no saben sus metros van al final en los dos sentidos.
  const left = (item: ReelListItem, unknown: number) => item.figures.remainingM ?? unknown;
  const orders: Record<
    NonNullable<ReelsSearch["sort"]>,
    (a: ReelListItem, b: ReelListItem) => number
  > = {
    name: byName,
    remaining: (a, b) => left(b, -Infinity) - left(a, -Infinity) || byName(a, b),
    "remaining-asc": (a, b) => left(a, Infinity) - left(b, Infinity) || byName(a, b),
    pending: (a, b) =>
      (b.figures.pendingPulls ?? 0) - (a.figures.pendingPulls ?? 0) || byName(a, b),
  };
  return items.sort(orders[sort ?? "name"]);
}

/** Every text of a reel the search looks in. */
function searchable(reel: ReelRecord): string {
  return normalizeText(
    [reel.request, reel.drum, reel.tag, reel.code, reel.description].filter(Boolean).join(" "),
  );
}

/** «Bobinas»: the reels that match the search, a page of them. */
export async function searchReels(search: ReelsSearch): Promise<ReelListResult> {
  const [reels, pulls, cables, dates] = await Promise.all([
    loadReels(search.kind ? { kind: search.kind } : {}),
    loadPulls(search.kind),
    loadCables(),
    prisma.reel.groupBy({ by: ["kind"], _max: { excelDate: true } }),
  ]);
  const matched = matchAll(reels, pulls, cables);
  const words = search.q ? normalizeText(search.q).split(" ").filter(Boolean) : [];

  const items: ReelListItem[] = [];
  for (const reel of reels) {
    if (words.length > 0) {
      const text = searchable(reel);
      if (!words.every((word) => text.includes(word))) continue;
    }
    const pending = matched.pending.get(reel.id) ?? [];
    const figures = figuresOf(reel, reelTotals(matched.pulls.get(reel.id) ?? [], pending));
    const state = reelState(figures.remainingM);
    if (search.state && state !== search.state) continue;
    items.push({
      id: reel.id,
      kind: reel.kind,
      drum: reel.drum,
      tag: reel.tag,
      request: reel.request,
      description: reel.description,
      figures,
      state,
    });
  }
  sortItems(items, search.sort);
  // Lo buscado tal cual («26», un drum, «EJ-DRUM 10») va primero; después, lo que lo contiene.
  if (search.q && (search.sort ?? "name") === "name") {
    const wanted = normalizeText(search.q);
    const exact = (item: ReelListItem) =>
      [item.tag, item.drum, item.request].some(
        (name) => name !== null && normalizeText(name) === wanted,
      );
    items.sort((a, b) => Number(exact(b)) - Number(exact(a)));
  }

  const size = search.size ?? REEL_PAGE_SIZES[0];
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(search.page ?? 1, pageCount);
  return {
    items: items.slice((page - 1) * size, page * size),
    total: items.length,
    page,
    pageCount,
    excelDates: dates.flatMap((row) =>
      row._max.excelDate ? [{ kind: row.kind, day: row._max.excelDate }] : [],
    ),
  };
}

export type ReelDetail = {
  reel: {
    id: string;
    kind: ExcelKind;
    drum: string | null;
    tag: string | null;
    code: string | null;
    request: string | null;
    description: string | null;
    voltage: string | null;
    pickedUpOn: Date | null;
    deliveredOn: Date | null;
    otherM: number | null;
    deliveredM: number | null;
    tracked: boolean;
    pieces: number | null;
    excelDate: Date;
  };
  figures: ReelFigures;
  state: ReelState | null;
  /** What the pullings and the pending cables add up to, to compare with the follow-up. */
  totals: ReelTotals;
  pulls: ReelPullEntry[];
  pending: ReelPendingEntry[];
  /** Other reels with its factory name: pieces of one drum. */
  sameDrum: { id: string; tag: string | null }[];
};

/** One reel with its pullings and pending cables; null when it does not exist (or no longer). */
export async function getReel(id: string): Promise<ReelDetail | null> {
  const reel = await prisma.reel.findUnique({ where: { id }, select: REEL_SELECT });
  if (!reel) return null;
  const [reels, pulls, cables] = await Promise.all([
    loadReels({ kind: reel.kind }),
    loadPulls(reel.kind),
    loadCables(),
  ]);
  const matched = matchAll(reels, pulls, cables);
  const own = matched.pulls.get(reel.id) ?? [];
  const pending = matched.pending.get(reel.id) ?? [];
  const totals = reelTotals(own, pending);
  const figures = figuresOf(reel, totals);
  const byCode = (a: ReelPendingEntry, b: ReelPendingEntry) =>
    natural.compare(a.cable.code, b.cable.code);
  return {
    reel: {
      id: reel.id,
      kind: reel.kind,
      drum: reel.drum,
      tag: reel.tag,
      code: reel.code,
      request: reel.request,
      description: reel.description,
      voltage: reel.voltage,
      pickedUpOn: reel.pickedUpOn,
      deliveredOn: reel.deliveredOn,
      otherM: toNumber(reel.otherM),
      deliveredM: toNumber(reel.deliveredM),
      tracked: reel.tracked,
      pieces: reel.pieces,
      excelDate: reel.excelDate,
    },
    figures,
    state: reelState(figures.remainingM),
    totals,
    // Lo último tirado primero; el mismo día, en el orden del Excel.
    pulls: [...own].sort(
      (a, b) => (b.pulledOn?.getTime() ?? 0) - (a.pulledOn?.getTime() ?? 0) || a.row - b.row,
    ),
    pending: [...pending].sort(byCode),
    sameDrum:
      reel.drum === null
        ? []
        : reels
            .filter((other) => other.id !== reel.id && other.drum === reel.drum)
            .map((other) => ({ id: other.id, tag: other.tag })),
  };
}

/** «26 · EJ-DRUM 10»: the number on the reel and its site name. */
export function reelLabel(reel: {
  tag: string | null;
  drum: string | null;
  request: string | null;
}): string {
  return [reel.tag ?? reel.drum, reel.request].filter(Boolean).join(" · ");
}

export type CableReelLink = { id: string; label: string };

/**
 * The reels of a cable, for links in its record: the ones its pullings were taken from (by its
 * code, or by its circuit and section) and the planned one. A name that is no reel of the
 * Excel gives no link.
 */
export async function reelLinksOfCable(cable: {
  id: string;
  code: string;
  level: CableLevel | null;
  plannedReel: string | null;
}): Promise<{ real: CableReelLink[]; planned: CableReelLink[] }> {
  const section = /^(.+)\.(\d+)$/.exec(cable.code);
  const pulls = await prisma.reelPull.findMany({
    where: {
      import: { status: "APPLIED" },
      OR: [
        { code: cable.code },
        ...(section ? [{ code: section[1]!, circuit: Number(section[2]) }] : []),
      ],
    },
    select: { kind: true, tag: true, drum: true },
  });
  let kind = excelKindOfLevel(cable.level) ?? pulls[0]?.kind ?? null;
  if (kind === null && cable.plannedReel) {
    const last = await prisma.cableEvent.findFirst({
      where: { cableId: cable.id, excelImportId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { excelImport: { select: { kind: true } } },
    });
    kind = last?.excelImport?.kind ?? null;
  }
  if (kind === null) return { real: [], planned: [] };
  const reels = await loadReels({ kind });
  const byId = new Map(reels.map((reel) => [reel.id, reel]));
  const link = (id: string) => ({ id, label: reelLabel(byId.get(id)!) });
  const find = createPullReelFinder(reels);
  const real = [
    ...new Set(
      pulls
        .filter((pull) => pull.kind === kind)
        .map((pull) => find(pull))
        .filter((id): id is string => id !== null),
    ),
  ];
  const planned = [
    ...new Set(createReelMatcher(reels)(kind, cable.plannedReel).flatMap((match) => match.reelIds)),
  ];
  return { real: real.map(link), planned: planned.map(link) };
}
