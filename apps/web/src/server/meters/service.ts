import "server-only";
import { Prisma, prisma } from "@cables/db";
import { CABLE_LEVELS, CABLE_LEVEL_LABELS, lengthDeviation, type CableLevel } from "@cables/shared";

/**
 * «Metros» (fase 17): the works measured in metres, not only in cables. Every query leaves out
 * the cables taken out (`deletedAt`) and the retired ones: they are no longer to be laid.
 */
const ACTIVE = Prisma.sql`c."deletedAt" IS NULL AND c."installationStatus" <> 'RETIRED'`;

/**
 * Cables of one record: a section of a circuit may hold several in parallel (3 single cores,
 * "1 de 6" with 3 cables each). Its length is the one of each cable, so the metres of the
 * record are that length times its cables, as the Excel counts them.
 */
const CABLES = Prisma.sql`COALESCE(c."cablesPerCircuit", 1)`;

/**
 * Metres laid of a cable laid end to end: the real ones when the Excel brings them, the planned
 * ones otherwise. A cable laid only in part counts nothing: how far it got is not known. Nor
 * does one without a planned length: the planned total leaves it out, so the laid metres must
 * too, or «X de Y» would compare two different sets of cables.
 */
const LAID_METRES = Prisma.sql`CASE WHEN c."installationStatus" = 'LAID' AND c."lengthM" IS NOT NULL
  THEN COALESCE(c."actualLengthM", c."lengthM") * ${CABLES} ELSE 0 END`;
const PLANNED_METRES = Prisma.sql`c."lengthM" * ${CABLES}`;
const ACTUAL_METRES = Prisma.sql`c."actualLengthM" * ${CABLES}`;

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
      sum(${PLANNED_METRES}) AS planned, sum(${LAID_METRES}) AS laid
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
        sum(${PLANNED_METRES}) AS planned, sum(${ACTUAL_METRES}) AS actual
      FROM cable c WHERE ${COMPARED}
      GROUP BY c."level"`,
    // Donde empieza el cable: su ubicación de origen y, si no tiene (los listados eléctricos no
    // la traen), la de la primera bandeja de su recorrido. El área es la segunda rama de esa
    // ruta ("/99/99UX/…").
    prisma.$queryRaw<({ id: string | null; name: string | null } & Sums)[]>`
      SELECT a."id" AS id, a."name" AS name, count(*) AS cables,
        sum(${PLANNED_METRES}) AS planned, sum(${ACTUAL_METRES}) AS actual
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

/** The states the Excel gives a reel («En Sitio»), for the notice above its cables. */
export async function getReelStatus(reel: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ status: string | null }[]>`
    SELECT string_agg(DISTINCT c."reelStatus", ' · ') AS status
    FROM cable c WHERE c."deletedAt" IS NULL AND c."reel" = ${reel}`;
  return rows[0]?.status ?? null;
}
