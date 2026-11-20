import "server-only";
import { Prisma, prisma } from "@cables/db";
import { CABLE_LEVELS, CABLE_LEVEL_LABELS, lengthDeviation, type CableLevel } from "@cables/shared";
import { escapeLike } from "@/server/like";

/**
 * «Metros» (fase 17): the works measured in metres, not only in cables. Every query leaves out
 * the cables taken out (`deletedAt`) and the retired ones: they are no longer to be laid.
 */
const ACTIVE = Prisma.sql`c."deletedAt" IS NULL AND c."installationStatus" <> 'RETIRED'`;

/**
 * Metres laid of a cable laid end to end: the real ones when the Excel brings them, the planned
 * ones otherwise. A cable laid only in part counts nothing: how far it got is not known.
 */
const LAID_METRES = Prisma.sql`CASE WHEN c."installationStatus" = 'LAID'
  THEN COALESCE(c."actualLengthM", c."lengthM") ELSE 0 END`;

const toNumber = (value: Prisma.Decimal | number | bigint | null): number =>
  value === null ? 0 : Number(value);

const levelLabel = (level: CableLevel | null) => (level ? CABLE_LEVEL_LABELS[level] : "Sin nivel");
const levelHref = (level: CableLevel | null) => (level ? `/cables?level=${level}` : "/cables");

export type MetersProgressRow = {
  key: string;
  label: string;
  /** Link to the cables of the row in the search. */
  href: string;
  cables: number;
  planned: number;
  laid: number;
};

export type MetersProgress = {
  /** Planned metres of every active cable, and how many have none in their list. */
  planned: number;
  laid: number;
  cables: number;
  withoutLength: number;
  byLevel: MetersProgressRow[];
};

/** «Llevamos 169 km tendidos de 404 previstos», and the same by level. */
export async function getMetersProgress(): Promise<MetersProgress> {
  const rows = await prisma.$queryRaw<
    {
      level: CableLevel | null;
      cables: bigint;
      without_length: bigint;
      planned: Prisma.Decimal | null;
      laid: Prisma.Decimal | null;
    }[]
  >`
    SELECT c."level" AS level, count(*) AS cables,
      count(*) FILTER (WHERE c."lengthM" IS NULL) AS without_length,
      sum(c."lengthM") AS planned, sum(${LAID_METRES}) AS laid
    FROM cable c WHERE ${ACTIVE}
    GROUP BY c."level"`;
  const byLevel = [...CABLE_LEVELS, null].flatMap((level) => {
    const row = rows.find((item) => item.level === level);
    if (!row) return [];
    return [
      {
        key: level ?? "none",
        label: levelLabel(level),
        href: levelHref(level),
        cables: Number(row.cables),
        planned: toNumber(row.planned),
        laid: toNumber(row.laid),
      },
    ];
  });
  return {
    planned: byLevel.reduce((sum, row) => sum + row.planned, 0),
    laid: byLevel.reduce((sum, row) => sum + row.laid, 0),
    cables: byLevel.reduce((sum, row) => sum + row.cables, 0),
    withoutLength: rows.reduce((sum, row) => sum + Number(row.without_length), 0),
    byLevel,
  };
}

export type DeviationRow = {
  key: string;
  label: string;
  /** Link to its cables in the search, when the search can find them (not by area). */
  href: string | null;
  /** Cables with both lengths: only those are compared. */
  cables: number;
  planned: number;
  actual: number;
};

export type DeviatedCable = {
  id: string;
  code: string;
  level: CableLevel | null;
  planned: number;
  actual: number;
  percent: number;
};

export type MetersDeviation = {
  /** Cables with real metres and planned ones: what the totals compare. */
  compared: number;
  planned: number;
  actual: number;
  byLevel: DeviationRow[];
  /**
   * By the area the cable starts in (its origin or, without one, the first tray of its route);
   * the cables without one go together, last.
   */
  byArea: DeviationRow[];
  /** The cables furthest from their list, either way. */
  top: DeviatedCable[];
};

export const TOP_DEVIATIONS = 50;

/** Only cables with both lengths, so that the totals compare like with like. */
const COMPARED = Prisma.sql`${ACTIVE} AND c."actualLengthM" IS NOT NULL AND c."lengthM" > 0`;

type Sums = { cables: bigint; planned: Prisma.Decimal | null; actual: Prisma.Decimal | null };

const sums = (row: Sums) => ({
  cables: Number(row.cables),
  planned: toNumber(row.planned),
  actual: toNumber(row.actual),
});

/** Real metres against the planned ones: totals, by level, by area and the worst cables. */
export async function getMetersDeviation(): Promise<MetersDeviation> {
  const [levels, areas, top] = await Promise.all([
    prisma.$queryRaw<({ level: CableLevel | null } & Sums)[]>`
      SELECT c."level" AS level, count(*) AS cables,
        sum(c."lengthM") AS planned, sum(c."actualLengthM") AS actual
      FROM cable c WHERE ${COMPARED}
      GROUP BY c."level"`,
    // Donde empieza el cable: su ubicación de origen y, si no tiene (los listados eléctricos no
    // la traen), la de la primera bandeja de su recorrido. El área es la segunda rama de esa
    // ruta ("/80/80UB/…").
    prisma.$queryRaw<({ id: string | null; name: string | null } & Sums)[]>`
      SELECT a."id" AS id, a."name" AS name, count(*) AS cables,
        sum(c."lengthM") AS planned, sum(c."actualLengthM") AS actual
      FROM cable c
      LEFT JOIN location o ON o."id" = c."originId"
      LEFT JOIN LATERAL (
        SELECT l."path" FROM cable_route_step s
        JOIN tray t ON t."id" = s."trayId"
        JOIN location l ON l."id" = t."locationId"
        WHERE s."cableId" = c."id"
        ORDER BY s."position"
        LIMIT 1
      ) r ON true
      LEFT JOIN location a ON a."type" = 'AREA'
        AND a."path" = '/' || split_part(COALESCE(o."path", r."path"), '/', 2)
          || '/' || split_part(COALESCE(o."path", r."path"), '/', 3)
      WHERE ${COMPARED}
      GROUP BY a."id", a."name"`,
    prisma.$queryRaw<
      {
        id: string;
        code: string;
        level: CableLevel | null;
        planned: Prisma.Decimal;
        actual: Prisma.Decimal;
      }[]
    >`
      SELECT c."id", c."code", c."level", c."lengthM" AS planned, c."actualLengthM" AS actual
      FROM cable c WHERE ${COMPARED}
      ORDER BY abs(c."actualLengthM" - c."lengthM") / c."lengthM" DESC, c."code"
      LIMIT ${TOP_DEVIATIONS}`,
  ]);

  const byLevel = [...CABLE_LEVELS, null].flatMap((level) => {
    const row = levels.find((item) => item.level === level);
    return row
      ? [{ key: level ?? "none", label: levelLabel(level), href: levelHref(level), ...sums(row) }]
      : [];
  });
  const byArea = areas
    .map((row) => ({
      key: row.id ?? "none",
      label: row.name ?? "Sin área",
      // Sin enlace: el buscador filtra por origen y destino, y muchos de estos cables no los traen.
      href: null,
      ...sums(row),
    }))
    .sort((a, b) =>
      a.key === "none" ? 1 : b.key === "none" ? -1 : a.label.localeCompare(b.label, "es"),
    );

  return {
    compared: byLevel.reduce((sum, row) => sum + row.cables, 0),
    planned: byLevel.reduce((sum, row) => sum + row.planned, 0),
    actual: byLevel.reduce((sum, row) => sum + row.actual, 0),
    byLevel,
    byArea,
    top: top.map((row) => {
      const planned = Number(row.planned);
      const actual = Number(row.actual);
      return {
        id: row.id,
        code: row.code,
        level: row.level,
        planned,
        actual,
        percent: lengthDeviation(planned, actual)!.percent,
      };
    }),
  };
}

export type ReelRow = {
  reel: string;
  /** The states the Excel gives it ("En obra"), when it brings any. */
  status: string | null;
  cables: number;
  /** Real metres of its cables; those without them are counted apart. */
  metres: number;
  withoutMetres: number;
  /** The last day one of its cables was laid. */
  lastLaidOn: Date | null;
};

/** Every reel the Excel names, with its cables and the metres taken from it. */
export async function listReels(q?: string): Promise<ReelRow[]> {
  const filter = q ? Prisma.sql`AND c."reel" ILIKE ${`%${escapeLike(q)}%`}` : Prisma.empty;
  const rows = await prisma.$queryRaw<
    {
      reel: string;
      status: string | null;
      cables: bigint;
      metres: Prisma.Decimal | null;
      without_metres: bigint;
      last_laid_on: Date | null;
    }[]
  >`
    SELECT c."reel" AS reel,
      string_agg(DISTINCT c."reelStatus", ' · ') AS status,
      count(*) AS cables, sum(c."actualLengthM") AS metres,
      count(*) FILTER (WHERE c."actualLengthM" IS NULL) AS without_metres,
      max(c."laidOn") AS last_laid_on
    FROM cable c
    WHERE c."deletedAt" IS NULL AND c."reel" IS NOT NULL ${filter}
    GROUP BY c."reel"
    ORDER BY c."reel"`;
  return rows.map((row) => ({
    reel: row.reel,
    status: row.status,
    cables: Number(row.cables),
    metres: toNumber(row.metres),
    withoutMetres: Number(row.without_metres),
    lastLaidOn: row.last_laid_on,
  }));
}
