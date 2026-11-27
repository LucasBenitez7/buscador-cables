import "server-only";
import { prisma, Prisma } from "@cables/db";
import { parseDrawingMarks, type DrawingMark, type EquipmentListSort } from "@cables/shared";
import { listLocationOptions } from "@/server/cables/service";
import { hasDrawingImage, redMarksOf } from "@/server/drawings/store";
import { escapeLike } from "@/server/like";
import { groupEquipmentEnds, type EquipmentGroup } from "./group";

/** Longest equipment tag accepted from a URL or the search box. */
export const EQUIPMENT_MAX = 120;
export const EQUIPMENT_LIMIT = 60;

export type EquipmentMatch = { equipment: string; cables: number };

/**
 * Equipment tags that contain `query` (origin or destination of a cable), with how many cables
 * end in each, most cables first. Without a query, the equipment with the most cables.
 */
export async function searchEquipment(
  query: string,
  sort: EquipmentListSort = "cables",
): Promise<EquipmentMatch[]> {
  const text = query.trim().slice(0, EQUIPMENT_MAX);
  const pattern = `%${escapeLike(text)}%`;
  const filter = (column: Prisma.Sql) =>
    text ? Prisma.sql`AND ${column} ILIKE ${pattern}` : Prisma.empty;
  return prisma.$queryRaw<EquipmentMatch[]>`
    SELECT equipment, count(*)::int AS cables FROM (
      SELECT "originEquipment" AS equipment FROM cable
        WHERE "deletedAt" IS NULL AND "originEquipment" IS NOT NULL ${filter(Prisma.sql`"originEquipment"`)}
      UNION ALL
      SELECT "destinationEquipment" FROM cable
        WHERE "deletedAt" IS NULL AND "destinationEquipment" IS NOT NULL ${filter(Prisma.sql`"destinationEquipment"`)}
    ) ends
    GROUP BY equipment
    ORDER BY ${
      sort === "name"
        ? Prisma.sql`equipment`
        : sort === "name-desc"
          ? Prisma.sql`equipment DESC`
          : sort === "cables-asc"
            ? Prisma.sql`cables, equipment`
            : Prisma.sql`cables DESC, equipment`
    }
    LIMIT ${EQUIPMENT_LIMIT}`;
}

/** A room or area the cables of the equipment end in, by the lists (fase 19). */
export type EquipmentLocation = { id: string; name: string; cables: number };

/** A sheet of the routing drawings where the equipment is written (fase 19). */
export type EquipmentSheet = {
  drawing: string;
  sheet: string;
  title: string | null;
  /** What the sheet writes: the tag, or its instrument without the part. */
  drawnAs: string;
  marks: DrawingMark[];
  /** Tiles of the sheet; null until `pnpm data:render` draws it. */
  image: { key: string; width: number; height: number; redMarks: string | null } | null;
};

export type EquipmentDetail = {
  equipment: string;
  /** Sheets where it is drawn, the ones with an image first. */
  drawings: EquipmentSheet[];
  /** Where it is: the locations of the ends of its cables, the most used first. */
  locations: EquipmentLocation[];
  groups: EquipmentGroup[];
  totals: { ends: number; connected: number; tested: number };
};

/**
 * Everything that ends in one equipment, grouped by terminal strip. The tag is compared
 * without case, as the search does. Null if no cable ends there.
 */
export async function getEquipment(equipment: string): Promise<EquipmentDetail | null> {
  const tag = equipment.trim();
  if (!tag || tag.length > EQUIPMENT_MAX) return null;
  const cables = await prisma.cable.findMany({
    where: {
      deletedAt: null,
      OR: [
        { originEquipment: { equals: tag, mode: "insensitive" } },
        { destinationEquipment: { equals: tag, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      code: true,
      description: true,
      originEquipment: true,
      destinationEquipment: true,
      originId: true,
      destinationId: true,
      connectionStatus: true,
      testStatus: true,
      wires: {
        orderBy: { position: "asc" },
        omit: { id: true, cableId: true, wire: true, colour: true },
      },
    },
  });
  if (cables.length === 0) return null;

  const groups = groupEquipmentEnds(tag, cables);
  const ends = groups.flatMap((group) => group.ends);
  // The tag as the lists write it, not as it was typed in the URL.
  const first = cables[0]!;
  const written =
    first.originEquipment?.toUpperCase() === tag.toUpperCase()
      ? first.originEquipment
      : first.destinationEquipment;
  return {
    equipment: written ?? tag,
    locations: await locationsOf(tag, cables),
    drawings: await sheetsOf(written ?? tag),
    groups,
    totals: {
      ends: ends.length,
      connected: ends.filter((end) => end.connected).length,
      tested: ends.filter((end) => end.testStatus === "TESTED_OK").length,
    },
  };
}

/**
 * The locations of the ends of the cables that land in the equipment: where it is, as far as
 * the lists say. A cable with both ends in it counts once per end.
 */
async function locationsOf(
  tag: string,
  cables: readonly {
    originEquipment: string | null;
    destinationEquipment: string | null;
    originId: string | null;
    destinationId: string | null;
  }[],
): Promise<EquipmentLocation[]> {
  const same = (value: string | null) => value?.toUpperCase() === tag.toUpperCase();
  const counts = new Map<string, number>();
  for (const cable of cables) {
    for (const [equipment, location] of [
      [cable.originEquipment, cable.originId],
      [cable.destinationEquipment, cable.destinationId],
    ] as const) {
      if (location && same(equipment)) counts.set(location, (counts.get(location) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return [];
  const names = new Map(
    (await listLocationOptions({ includePlants: true })).map((option) => [option.id, option.label]),
  );
  return [...counts]
    .flatMap(([id, count]) => {
      const name = names.get(id);
      return name ? [{ id, name, cables: count }] : [];
    })
    .sort((a, b) => b.cables - a.cables || a.name.localeCompare(b.name, "es"));
}

/** The sheets where the equipment is drawn, with their image when it has been rendered. */
async function sheetsOf(tag: string): Promise<EquipmentSheet[]> {
  const rows = await prisma.equipmentDrawing.findMany({
    where: { equipment: { equals: tag, mode: "insensitive" } },
    orderBy: [{ drawing: "asc" }, { sheet: "asc" }],
    select: {
      drawing: true,
      sheet: true,
      title: true,
      drawnAs: true,
      marks: true,
      drawingSheet: { select: { imageKey: true, width: true, height: true } },
    },
  });
  const sheets = await Promise.all(
    rows.map(async (row) => ({
      drawing: row.drawing,
      sheet: row.sheet,
      title: row.title,
      drawnAs: row.drawnAs,
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
  return sheets.sort((a, b) => Number(b.image !== null) - Number(a.image !== null));
}
