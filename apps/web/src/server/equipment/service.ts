import "server-only";
import { prisma, Prisma } from "@cables/db";
import { escapeLike } from "@/server/like";
import { groupEquipmentEnds, type EquipmentGroup } from "./group";

/** Longest equipment tag accepted from a URL or the search box. */
export const EQUIPMENT_MAX = 120;
const SEARCH_LIMIT = 60;

export type EquipmentMatch = { equipment: string; cables: number };

/**
 * Equipment tags that contain `query` (origin or destination of a cable), with how many cables
 * end in each, most cables first. Without a query, the equipment with the most cables.
 */
export async function searchEquipment(
  query: string,
  sort: "cables" | "name" | "name-desc" = "cables",
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
          : Prisma.sql`cables DESC, equipment`
    }
    LIMIT ${SEARCH_LIMIT}`;
}

export type EquipmentDetail = {
  equipment: string;
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
    groups,
    totals: {
      ends: ends.length,
      connected: ends.filter((end) => end.connected).length,
      tested: ends.filter((end) => end.testStatus === "TESTED_OK").length,
    },
  };
}
