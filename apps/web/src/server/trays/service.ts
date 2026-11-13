import "server-only";
import { Prisma, prisma } from "@cables/db";
import {
  TRAY_PAGE_SIZE,
  type CableEndSide,
  type CableLevel,
  type ConnectionStatus,
  type InstallationStatus,
  type TrayKind,
} from "@cables/shared";
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

export type TrayDetail = TrayListItem & {
  notes: string | null;
  drawings: { drawing: string; sheet: string; title: string | null; sourcePage: number | null }[];
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
  search: { q?: string; page?: number },
  pageSize = TRAY_PAGE_SIZE,
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
      drawings: { orderBy: [{ drawing: "asc" }, { sheet: "asc" }] },
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
    drawings: tray.drawings.map(({ drawing, sheet, title, sourcePage }) => ({
      drawing,
      sheet,
      title,
      sourcePage,
    })),
    waitingCables: tray.looseEndCables.map(toCable).sort(byCode),
    routeCables,
  };
}
