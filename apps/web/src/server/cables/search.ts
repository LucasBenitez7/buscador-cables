import "server-only";
import { Prisma, prisma } from "@cables/db";
import {
  SEARCH_PAGE_SIZE,
  effectiveSort,
  hasActivityFilters,
  normalizeCableCode,
  type CableAction,
  type CableLevel,
  type CableSearch,
  type CableState,
  type ConnectionStatus,
  type InstallationStatus,
} from "@cables/shared";
import {
  getCableFormOptions,
  listLocationOptions,
  type LocationOption,
  type Option,
} from "@/server/cables/service";
import { escapeLike } from "@/server/like";
import { findSubtreeIds } from "@/server/locations/service";

export type CableSearchItem = {
  id: string;
  code: string;
  /** For the row's action dialog (concurrency control and state machine). */
  version: number;
  state: CableState;
  description: string | null;
  type: string | null;
  color: { name: string; hex: string | null } | null;
  conductors: number | null;
  crossSectionMm2: number | null;
  lengthM: number | null;
  installationStatus: InstallationStatus;
  connectionStatus: ConnectionStatus;
  level: CableLevel | null;
  /** Equipment of each end (cables from the project lists). */
  originEquipment: string | null;
  destinationEquipment: string | null;
  origin: string | null;
  destination: string | null;
  lastAction: CableAction | null;
  lastActionAt: Date | null;
  lastActionBy: string | null;
};

export type CableSearchResult = {
  items: CableSearchItem[];
  total: number;
  page: number;
  pageCount: number;
  /** True when no code contained the text and similar codes are shown instead. */
  fuzzy?: boolean;
};

/** Similarity from which a code counts as "parecido" in the typo fallback. */
const FUZZY_THRESHOLD = 0.4;

/** Escapes LIKE wildcards typed by the user ("%" or "_" must match literally). */
function likeContains(value: string): string {
  return `%${escapeLike(value)}%`;
}

/** "SH-2" before "SH-10": letters first, then the first number padded, then the code. */
function naturalCodeOrder(direction: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    substring(c."code" from '^[^0-9]*') ${direction},
    lpad(coalesce(substring(c."code" from '[0-9]+'), ''), 20, '0') ${direction},
    c."code" ${direction}`;
}

async function buildConditions(search: CableSearch, fuzzy: boolean): Promise<Prisma.Sql[] | null> {
  const conditions: Prisma.Sql[] = [Prisma.sql`c."deletedAt" IS NULL`];

  if (search.q) {
    // "sh50" → "SH-50"; también se compara sin guiones para encontrar "SH50" en "SH-50".
    // Si la búsqueda solo tiene signos ("_", "-"), lo normalizado queda vacío y
    // "ILIKE '%%'" encontraría todos los cables: entonces solo se busca en la descripción.
    const normalized = normalizeCableCode(search.q);
    const compact = normalized.replace(/-/g, "");
    if (fuzzy) {
      // Solo si no hubo coincidencias exactas: códigos parecidos para tolerar erratas
      // ("shh50" → SH-50). `%` usa el índice GIN; el umbral afina la similitud.
      conditions.push(
        Prisma.sql`(c."code" % ${normalized} AND similarity(c."code", ${normalized}) > ${FUZZY_THRESHOLD})`,
      );
    } else {
      const matches: Prisma.Sql[] = [Prisma.sql`c."description" ILIKE ${likeContains(search.q)}`];
      if (normalized) {
        matches.push(Prisma.sql`c."code" ILIKE ${likeContains(normalized)}`);
      }
      if (compact) {
        matches.push(Prisma.sql`replace(c."code", '-', '') ILIKE ${likeContains(compact)}`);
      }
      // Equipment of either end ("todos los cables del cuadro 99BMA") and the marking number.
      const equipment = search.q.trim().toUpperCase();
      if (equipment) {
        matches.push(
          Prisma.sql`c."originEquipment" ILIKE ${likeContains(equipment)}`,
          Prisma.sql`c."destinationEquipment" ILIKE ${likeContains(equipment)}`,
          Prisma.sql`c."altCode" ILIKE ${likeContains(equipment)}`,
        );
      }
      conditions.push(Prisma.sql`(${Prisma.join(matches, " OR ")})`);
    }
  }

  if (search.location) {
    const ids = await findSubtreeIds(search.location);
    if (ids.length === 0) {
      return null;
    }
    const list = Prisma.join(ids);
    conditions.push(Prisma.sql`(
      c."originId" IN (${list})
      OR c."destinationId" IN (${list})
      OR c."currentLocationId" IN (${list})
    )`);
  }

  if (search.type) conditions.push(Prisma.sql`c."typeId" = ${search.type}`);
  if (search.color) conditions.push(Prisma.sql`c."colorId" = ${search.color}`);
  if (search.manufacturer) conditions.push(Prisma.sql`c."manufacturerId" = ${search.manufacturer}`);
  if (search.installation) {
    conditions.push(
      Prisma.sql`c."installationStatus" = ${search.installation}::"InstallationStatus"`,
    );
  }
  if (search.connection) {
    conditions.push(Prisma.sql`c."connectionStatus" = ${search.connection}::"ConnectionStatus"`);
  }
  if (search.level) {
    conditions.push(Prisma.sql`c."level" = ${search.level}::"CableLevel"`);
  }
  if (search.tray && search.loose) {
    // Cables whose loose end waits in that tray.
    conditions.push(
      Prisma.sql`c."looseEndTrayId" = (SELECT t."id" FROM "tray" t WHERE t."code" = ${search.tray})`,
    );
  } else if (search.tray) {
    // Cables whose planned route goes through that tray.
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "cable_route_step" s JOIN "tray" t ON t."id" = s."trayId"
      WHERE s."cableId" = c."id" AND t."code" = ${search.tray}
    )`);
  } else if (search.loose) {
    conditions.push(Prisma.sql`c."looseEndTrayId" IS NOT NULL`);
  }

  const ranges: [number | undefined, number | undefined, Prisma.Sql][] = [
    [search.sectionMin, search.sectionMax, Prisma.sql`c."crossSectionMm2"`],
    [search.diameterMin, search.diameterMax, Prisma.sql`c."outerDiameterMm"`],
    [search.lengthMin, search.lengthMax, Prisma.sql`c."lengthM"`],
  ];
  for (const [min, max, column] of ranges) {
    if (min !== undefined) conditions.push(Prisma.sql`${column} >= ${min}`);
    if (max !== undefined) conditions.push(Prisma.sql`${column} <= ${max}`);
  }

  if (hasActivityFilters(search)) {
    // Todas las condiciones sobre el mismo evento: "cables que conectó Juan esta semana".
    // Los días se cuentan en hora de Madrid, como los ve la gente en planta.
    const event: Prisma.Sql[] = [Prisma.sql`e."cableId" = c."id"`];
    if (search.actor) event.push(Prisma.sql`e."userId" = ${search.actor}`);
    if (search.action) event.push(Prisma.sql`e."action" = ${search.action}::"CableAction"`);
    const localDay = Prisma.sql`(e."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Madrid')::date`;
    if (search.from) event.push(Prisma.sql`${localDay} >= ${search.from}::date`);
    if (search.to) event.push(Prisma.sql`${localDay} <= ${search.to}::date`);
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "cable_event" e WHERE ${Prisma.join(event, " AND ")})`,
    );
  }

  return conditions;
}

function orderBy(search: CableSearch): Prisma.Sql {
  const { sort, dir } = effectiveSort(search);
  // `dir` solo puede ser "asc" o "desc" (lo valida el esquema), nunca texto del usuario.
  const direction = Prisma.raw(dir === "desc" ? "DESC" : "ASC");
  const natural = naturalCodeOrder(Prisma.raw("ASC"));

  switch (sort) {
    case "relevance": {
      const normalized = normalizeCableCode(search.q ?? "");
      return Prisma.sql`(c."code" = ${normalized}) DESC, similarity(c."code", ${normalized}) DESC, ${natural}`;
    }
    case "updated":
      return Prisma.sql`c."updatedAt" ${direction}, ${natural}`;
    case "activity":
      return Prisma.sql`c."lastActionAt" ${direction} NULLS LAST, ${natural}`;
    case "length":
      return Prisma.sql`c."lengthM" ${direction} NULLS LAST, ${natural}`;
    case "section":
      return Prisma.sql`c."crossSectionMm2" ${direction} NULLS LAST, ${natural}`;
    case "code":
      return naturalCodeOrder(direction);
  }
}

const locationLabel = (location: { name: string; parent: { name: string } | null } | null) =>
  location
    ? location.parent
      ? `${location.parent.name} › ${location.name}`
      : location.name
    : null;

/**
 * Searches active cables. Filtering, sorting and paging run in one SQL query
 * over ids; the page of cables is then loaded with its related names.
 */
export async function searchCables(
  search: CableSearch,
  pageSize = SEARCH_PAGE_SIZE,
): Promise<CableSearchResult> {
  const countWhere = async (fuzzy: boolean) => {
    const conditions = await buildConditions(search, fuzzy);
    if (conditions === null) {
      return null;
    }
    const where = Prisma.join(conditions, " AND ");
    const [{ total }] = await prisma.$queryRaw<[{ total: bigint }]>`
      SELECT count(*) AS total FROM "cable" c WHERE ${where}`;
    return { where, count: Number(total) };
  };

  // Primero coincidencias exactas (subcadena); si no hay ninguna y se buscaba un
  // código, códigos parecidos. Así "sh50" no devuelve cientos de "SH-…" cortos.
  let fuzzy = false;
  let found = await countWhere(false);
  if (found?.count === 0 && search.q && normalizeCableCode(search.q)) {
    fuzzy = true;
    found = await countWhere(true);
  }
  if (!found) {
    return { items: [], total: 0, page: 1, pageCount: 0 };
  }
  const { where, count } = found;
  const pageCount = Math.ceil(count / pageSize);
  const page = Math.min(search.page ?? 1, Math.max(pageCount, 1));
  if (count === 0) {
    return { items: [], total: 0, page: 1, pageCount: 0 };
  }

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT c."id" FROM "cable" c
    WHERE ${where}
    ORDER BY ${orderBy(search)}
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
  const ids = rows.map((row) => row.id);

  const cables = await prisma.cable.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      code: true,
      version: true,
      currentLocationId: true,
      originId: true,
      destinationId: true,
      description: true,
      conductors: true,
      crossSectionMm2: true,
      lengthM: true,
      installationStatus: true,
      connectionStatus: true,
      lastAction: true,
      lastActionAt: true,
      type: { select: { name: true } },
      color: { select: { name: true, hex: true } },
      origin: { select: { name: true, parent: { select: { name: true } } } },
      destination: { select: { name: true, parent: { select: { name: true } } } },
      lastActionBy: { select: { name: true } },
      looseEnd: true,
      looseEndTray: { select: { code: true } },
      level: true,
      originEquipment: true,
      destinationEquipment: true,
    },
  });
  const byId = new Map(cables.map((cable) => [cable.id, cable]));

  const items = ids.flatMap((id) => {
    const cable = byId.get(id);
    if (!cable) {
      return [];
    }
    return [
      {
        id: cable.id,
        code: cable.code,
        version: cable.version,
        state: {
          installationStatus: cable.installationStatus,
          connectionStatus: cable.connectionStatus,
          currentLocationId: cable.currentLocationId,
          looseEnd: cable.looseEnd,
          looseEndTray: cable.looseEndTray?.code ?? null,
          // Cables from the project lists may know the equipment but not the room.
          originId: cable.originId ?? cable.originEquipment,
          destinationId: cable.destinationId ?? cable.destinationEquipment,
          // The search only returns active cables.
          deleted: false,
        },
        description: cable.description,
        type: cable.type?.name ?? null,
        color: cable.color,
        conductors: cable.conductors,
        crossSectionMm2: cable.crossSectionMm2?.toNumber() ?? null,
        lengthM: cable.lengthM?.toNumber() ?? null,
        installationStatus: cable.installationStatus,
        connectionStatus: cable.connectionStatus,
        level: cable.level,
        originEquipment: cable.originEquipment,
        destinationEquipment: cable.destinationEquipment,
        origin: locationLabel(cable.origin),
        destination: locationLabel(cable.destination),
        lastAction: cable.lastAction,
        lastActionAt: cable.lastActionAt,
        lastActionBy: cable.lastActionBy?.name ?? null,
      },
    ];
  });

  return { items, total: count, page, pageCount, ...(fuzzy ? { fuzzy } : {}) };
}

export type SearchOptions = {
  cableTypes: Option[];
  colors: Option[];
  manufacturers: Option[];
  /** Including plants: filtering by a plant includes everything in it. */
  locations: LocationOption[];
  /** Everybody can see who did what (phase 5 visibility rule). */
  users: Option[];
};

export async function getSearchOptions(): Promise<SearchOptions> {
  const [form, locations, users] = await Promise.all([
    getCableFormOptions(),
    listLocationOptions({ includePlants: true }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return {
    cableTypes: form.cableTypes,
    colors: form.colors,
    manufacturers: form.manufacturers,
    locations,
    users: users.map((user) => ({ id: user.id, label: user.name })),
  };
}
