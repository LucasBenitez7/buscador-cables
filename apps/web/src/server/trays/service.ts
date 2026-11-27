import "server-only";
import { Prisma, prisma } from "@cables/db";
import {
  TRAY_PAGE_SIZE,
  drawingMarkRank,
  parseDrawingMarks,
  type CableEndSide,
  type CableLevel,
  type ConnectionStatus,
  type DrawingMark,
  type TestStatus,
  type InstallationStatus,
  type TrayKind,
  type TraySearch,
  type TraySort,
} from "@cables/shared";
import { hasDrawingImage, redMarksOf } from "@/server/drawings/store";
import { escapeLike } from "@/server/like";
import { SELECT_ALL_MAX } from "@/server/select-all";

export type TrayListItem = {
  code: string;
  kind: TrayKind;
  voltageLevel: number | null;
  elevationLevel: number | null;
  building: string | null;
  /** The building in the location tree, to link it. */
  buildingId: string | null;
  size: TraySize;
  /** Active cables whose route goes through it (each cable once). */
  cables: number;
  /** Active cables whose loose end waits in it. */
  waiting: number;
};

type TraySize = {
  widthMm: number | null;
  flangeHeightMm: number | null;
  bendRadiusMm: number | null;
  diameterMm: number | null;
};

export type TrayCable = {
  id: string;
  code: string;
  level: CableLevel | null;
  description: string | null;
  originEquipment: string | null;
  destinationEquipment: string | null;
  installationStatus: InstallationStatus;
  connectionStatus: ConnectionStatus;
  testStatus: TestStatus;
  /** Which end waits in this tray, if any. */
  looseEndHere: CableEndSide | null;
};

/** A sheet of the drawings with where the tray is on it and, when drawn, its image. */
export type TraySheet = {
  drawing: string;
  sheet: string;
  title: string | null;
  sourcePage: number | null;
  marks: DrawingMark[];
  /**
   * Tiles of the sheet (`/api/drawings/<key>.dzi`); null until `pnpm data:render` draws it.
   * `redMarks`: the same sheet with the red marks of quality, when there is one (fase 19).
   */
  image: { key: string; width: number; height: number; redMarks: string | null } | null;
};

export type TrayDetail = TrayListItem & {
  notes: string | null;
  /** Sheets where the tray is, the ones that show it best first. */
  drawings: TraySheet[];
  /** Cables whose loose end waits here, then every cable whose route goes through it. */
  waitingCables: TrayCable[];
  routeCables: TrayCable[];
};

const ACTIVE = { deletedAt: null };

const buildingLabel = (
  location: { code: string; name: string; parent: { name: string } | null } | null,
) =>
  location
    ? location.name === location.code
      ? location.code
      : `${location.code} · ${location.name}`
    : null;

const sizeOf = (tray: TraySize): TraySize => ({
  widthMm: tray.widthMm,
  flangeHeightMm: tray.flangeHeightMm,
  bendRadiusMm: tray.bendRadiusMm,
  diameterMm: tray.diameterMm,
});

/** Levels (1-4) that some tray has, for the "Nivel" filter. */
export async function trayLevels(): Promise<number[]> {
  const rows = await prisma.tray.findMany({
    where: { voltageLevel: { not: null } },
    distinct: ["voltageLevel"],
    orderBy: { voltageLevel: "asc" },
    select: { voltageLevel: true },
  });
  return rows.flatMap((row) => (row.voltageLevel === null ? [] : [row.voltageLevel]));
}

/** The trays that match the filters (not the order or the page). */
function trayWhere(search: TraySearch): Prisma.TrayWhereInput {
  return {
    // Prisma does not escape LIKE wildcards in `contains`, and "_" is part of tray codes.
    ...(search.q ? { code: { contains: escapeLike(search.q), mode: "insensitive" as const } } : {}),
    ...(search.kind ? { kind: search.kind } : {}),
    ...(search.level ? { voltageLevel: search.level } : {}),
    // Solo cuentan los cables activos: un cable dado de baja no espera en ninguna bandeja.
    ...(search.waiting ? { looseEndCables: { some: ACTIVE } } : {}),
  };
}

/** Sorts that rank trays by a count (cables, waiting cables) instead of by code. */
type RankedSort = "cables" | "cables-asc" | "waiting";
const isRanked = (sort: TraySort | undefined): sort is RankedSort =>
  sort === "cables" || sort === "cables-asc" || sort === "waiting";

/**
 * Every tray that matches, ranked by how many active cables go through it ("cables": most first;
 * "cables-asc": fewest first) or wait in it ("waiting"), and then by code. Prisma cannot count
 * only the active cables in an `orderBy`, and there are a few thousand trays: they are ranked here.
 */
async function rankedTrayIds(where: Prisma.TrayWhereInput, sort: RankedSort): Promise<string[]> {
  const [trays, rows] = await Promise.all([
    prisma.tray.findMany({ where, select: { id: true, code: true } }),
    sort === "waiting"
      ? prisma.cable
          .groupBy({
            by: ["looseEndTrayId"],
            where: { ...ACTIVE, looseEndTrayId: { not: null } },
            _count: { _all: true },
          })
          .then((groups) => groups.map((row) => [row.looseEndTrayId, row._count._all] as const))
      : // Como en la lista y la ficha: un recorrido puede nombrar dos veces la misma bandeja.
        prisma.$queryRaw<{ trayId: string; cables: bigint }[]>`
          SELECT s."trayId", count(DISTINCT s."cableId") AS cables
          FROM "cable_route_step" s JOIN "cable" c ON c."id" = s."cableId"
          WHERE c."deletedAt" IS NULL
          GROUP BY s."trayId"`.then((groups) =>
          groups.map((row) => [row.trayId, Number(row.cables)] as const),
        ),
  ]);
  const counts = new Map<string | null, number>(rows);
  const direction = sort === "cables-asc" ? 1 : -1;
  return trays
    .sort(
      (a, b) =>
        direction * ((counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0)) ||
        a.code.localeCompare(b.code, "es", { numeric: true }),
    )
    .map((tray) => tray.id);
}

/** Trays by code (substring), with how many cables go through and wait in each one. */
export async function searchTrays(
  search: TraySearch,
  pageSize = search.size ?? TRAY_PAGE_SIZE,
): Promise<{ items: TrayListItem[]; total: number; page: number; pageCount: number }> {
  const where = trayWhere(search);
  const total = await prisma.tray.count({ where });
  const pageCount = Math.ceil(total / pageSize);
  const page = Math.min(search.page ?? 1, Math.max(pageCount, 1));
  const start = (page - 1) * pageSize;
  const ranked = isRanked(search.sort) ? await rankedTrayIds(where, search.sort) : null;
  const pageIds = ranked?.slice(start, start + pageSize);
  const trays = await prisma.tray.findMany({
    where: pageIds ? { id: { in: pageIds } } : where,
    orderBy: { code: search.sort === "code-desc" ? "desc" : "asc" },
    ...(pageIds ? {} : { skip: start, take: pageSize }),
    include: {
      location: {
        select: { id: true, code: true, name: true, parent: { select: { name: true } } },
      },
      _count: { select: { looseEndCables: { where: ACTIVE } } },
    },
  });
  // `findMany` no devuelve en el orden de `id in`: se pone en el del ranking.
  if (pageIds) trays.sort((a, b) => pageIds.indexOf(a.id) - pageIds.indexOf(b.id));
  // A route may name the same tray twice: count cables, not route steps, like the record.
  const counts =
    trays.length === 0
      ? []
      : await prisma.$queryRaw<{ trayId: string; cables: bigint }[]>`
          SELECT s."trayId", count(DISTINCT s."cableId") AS cables
          FROM "cable_route_step" s JOIN "cable" c ON c."id" = s."cableId"
          WHERE c."deletedAt" IS NULL
            AND s."trayId" IN (${Prisma.join(trays.map((tray) => tray.id))})
          GROUP BY s."trayId"`;
  const cablesByTray = new Map(counts.map((row) => [row.trayId, Number(row.cables)]));
  return {
    total,
    page,
    pageCount,
    items: trays.map((tray) => ({
      code: tray.code,
      kind: tray.kind,
      voltageLevel: tray.voltageLevel,
      elevationLevel: tray.elevationLevel,
      building: buildingLabel(tray.location),
      buildingId: tray.location?.id ?? null,
      size: sizeOf(tray),
      cables: cablesByTray.get(tray.id) ?? 0,
      waiting: tray._count.looseEndCables,
    })),
  };
}

/**
 * Every tray code that matches the search, in the order of the list (for «Seleccionar todas
 * las que cumplen los filtros»). Null when there are more than `SELECT_ALL_MAX`.
 */
export async function searchTrayCodes(search: TraySearch): Promise<string[] | null> {
  const where = trayWhere(search);
  const total = await prisma.tray.count({ where });
  if (total > SELECT_ALL_MAX) return null;
  if (isRanked(search.sort)) {
    const ids = await rankedTrayIds(where, search.sort);
    const trays = await prisma.tray.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true },
    });
    const codeOf = new Map(trays.map((tray) => [tray.id, tray.code]));
    return ids.flatMap((id) => codeOf.get(id) ?? []);
  }
  const trays = await prisma.tray.findMany({
    where,
    orderBy: { code: search.sort === "code-desc" ? "desc" : "asc" },
    select: { code: true },
  });
  return trays.map((tray) => tray.code);
}

const cableSelect = {
  id: true,
  code: true,
  level: true,
  description: true,
  originEquipment: true,
  destinationEquipment: true,
  installationStatus: true,
  connectionStatus: true,
  testStatus: true,
  looseEnd: true,
  looseEndTrayId: true,
} as const;

/** "99XAB10T1-W8001" before "99XAB10T1-W8010": by code, comparing numbers as numbers. */
const byCode = (a: { code: string }, b: { code: string }) =>
  a.code.localeCompare(b.code, "es", { numeric: true });

export async function getTrayDetail(code: string): Promise<TrayDetail | null> {
  const tray = await prisma.tray.findUnique({
    where: { code },
    include: {
      location: {
        select: { id: true, code: true, name: true, parent: { select: { name: true } } },
      },
      drawings: {
        orderBy: [{ drawing: "asc" }, { sheet: "asc" }],
        include: { drawingSheet: { select: { imageKey: true, width: true, height: true } } },
      },
      looseEndCables: { where: ACTIVE, select: cableSelect },
      routeSteps: {
        where: { cable: ACTIVE },
        select: { cable: { select: cableSelect } },
      },
    },
  });
  if (!tray) return null;

  const toCable = (cable: (typeof tray.looseEndCables)[number]): TrayCable => ({
    id: cable.id,
    code: cable.code,
    level: cable.level,
    description: cable.description,
    originEquipment: cable.originEquipment,
    destinationEquipment: cable.destinationEquipment,
    installationStatus: cable.installationStatus,
    connectionStatus: cable.connectionStatus,
    testStatus: cable.testStatus,
    looseEndHere: cable.looseEndTrayId === tray.id ? cable.looseEnd : null,
  });
  // A route may name the same tray twice: list each cable once.
  const routeCables = [
    ...new Map(tray.routeSteps.map((step) => [step.cable.id, toCable(step.cable)])).values(),
  ].sort(byCode);

  return {
    code: tray.code,
    kind: tray.kind,
    voltageLevel: tray.voltageLevel,
    elevationLevel: tray.elevationLevel,
    building: buildingLabel(tray.location),
    buildingId: tray.location?.id ?? null,
    size: sizeOf(tray),
    notes: tray.notes,
    cables: routeCables.length,
    waiting: tray.looseEndCables.length,
    drawings: await traySheets(tray.drawings),
    waitingCables: tray.looseEndCables.map(toCable).sort(byCode),
    routeCables,
  };
}

async function traySheets(
  rows: {
    drawing: string;
    sheet: string;
    title: string | null;
    sourcePage: number | null;
    marks: unknown;
    drawingSheet: { imageKey: string; width: number; height: number } | null;
  }[],
): Promise<TraySheet[]> {
  const sheets = await Promise.all(
    rows.map(async (row) => ({
      drawing: row.drawing,
      sheet: row.sheet,
      title: row.title,
      sourcePage: row.sourcePage,
      marks: parseDrawingMarks(row.marks),
      image:
        row.drawingSheet && (await hasDrawingImage(row.drawingSheet.imageKey))
          ? {
              key: row.drawingSheet.imageKey,
              width: row.drawingSheet.width,
              height: row.drawingSheet.height,
              redMarks: await redMarksOf(row.drawingSheet.imageKey),
            }
          : null,
    })),
  );
  // Las hojas que muestran la bandeja primero; a igualdad, el orden del plano.
  return sheets
    .map((sheet, index) => ({ sheet, index }))
    .sort(
      (a, b) =>
        drawingMarkRank(a.sheet.marks) - drawingMarkRank(b.sheet.marks) ||
        Number(b.sheet.image !== null) - Number(a.sheet.image !== null) ||
        a.index - b.index,
    )
    .map(({ sheet }) => sheet);
}
