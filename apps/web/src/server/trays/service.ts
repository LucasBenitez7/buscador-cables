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
  type InstallationStatus,
  type TrayKind,
  type TraySearch,
} from "@cables/shared";
import { hasDrawingImage } from "@/server/drawings/store";
import { escapeLike } from "@/server/like";

export type TrayListItem = {
  code: string;
  kind: TrayKind;
  voltageLevel: number | null;
  elevationLevel: number | null;
  building: string | null;
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
  /** Tiles of the sheet (`/api/drawings/<key>.dzi`); null until `pnpm data:render` draws it. */
  image: { key: string; width: number; height: number } | null;
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

/** Trays by code (substring), with how many cables go through and wait in each one. */
export async function searchTrays(
  search: TraySearch,
  pageSize = search.size ?? TRAY_PAGE_SIZE,
): Promise<{ items: TrayListItem[]; total: number; page: number; pageCount: number }> {
  // Prisma does not escape LIKE wildcards in `contains`, and "_" is part of tray codes.
  const where = search.q
    ? { code: { contains: escapeLike(search.q), mode: "insensitive" as const } }
    : {};
  const total = await prisma.tray.count({ where });
  const pageCount = Math.ceil(total / pageSize);
  const page = Math.min(search.page ?? 1, Math.max(pageCount, 1));
  const trays = await prisma.tray.findMany({
    where,
    orderBy: { code: "asc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      location: { select: { code: true, name: true, parent: { select: { name: true } } } },
      _count: { select: { looseEndCables: { where: ACTIVE } } },
    },
  });
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
      size: sizeOf(tray),
      cables: cablesByTray.get(tray.id) ?? 0,
      waiting: tray._count.looseEndCables,
    })),
  };
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
      location: { select: { code: true, name: true, parent: { select: { name: true } } } },
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
