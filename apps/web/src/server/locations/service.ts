import "server-only";
import { Prisma, prisma } from "@cables/db";
import {
  PATH_SEPARATOR,
  buildLocationPath,
  buildLocationTree,
  isWithinPath,
  validateLocationPlacement,
  type CreateLocationInput,
  type FlatLocation,
  type LocationNode,
  type LocationType,
  type MoveLocationInput,
  type UpdateLocationInput,
} from "@cables/shared";
import { isForeignKeyViolation, isUniqueViolation } from "@/server/prisma-errors";

export class LocationServiceError extends Error {}

export type LocationWithCounts = FlatLocation & {
  /**
   * Cables distintos (sin contar bajas) que salen, llegan o están físicamente en
   * esta ubicación o en cualquiera de las que contiene.
   */
  cableCount: number;
};

const DUPLICATE_CODE = "Ya existe una ubicación con ese código.";

export async function listLocationTree(): Promise<LocationNode<LocationWithCounts>[]> {
  const [locations, counts] = await Promise.all([
    prisma.location.findMany({
      select: { id: true, name: true, code: true, type: true, parentId: true, path: true },
    }),
    // Un cable cuenta una sola vez por ubicación aunque la toque por varias columnas
    // (p. ej. enrollado en su propio origen) o en varios sitios del mismo subárbol.
    // Primero el mapa ancestro → descendiente (pocas filas), luego pares únicos
    // (ancestro, cable) y por último el recuento: ~70 ms con 5.000 cables, frente a
    // ~190 ms con count(DISTINCT) directo.
    prisma.$queryRaw<{ id: string; cables: bigint }[]>`
      WITH tree AS MATERIALIZED (
        SELECT ancestor."id" AS ancestor_id, descendant."id" AS location_id
        FROM "location" ancestor
        JOIN "location" descendant
          ON descendant."path" = ancestor."path"
          OR descendant."path" LIKE ancestor."path" || ${PATH_SEPARATOR} || '%'
      ),
      touches AS (
        SELECT "id" AS cable_id, "originId" AS location_id FROM "cable" WHERE "deletedAt" IS NULL
        UNION ALL SELECT "id", "destinationId" FROM "cable" WHERE "deletedAt" IS NULL
        UNION ALL SELECT "id", "currentLocationId" FROM "cable" WHERE "deletedAt" IS NULL
      ),
      pairs AS (
        SELECT DISTINCT tree.ancestor_id, touches.cable_id
        FROM tree JOIN touches ON touches.location_id = tree.location_id
      )
      SELECT ancestor_id AS id, count(*) AS cables FROM pairs GROUP BY ancestor_id`,
  ]);

  const countById = new Map(counts.map((row) => [row.id, Number(row.cables)]));
  return buildLocationTree(
    locations.map((location) => ({ ...location, cableCount: countById.get(location.id) ?? 0 })),
  );
}

export async function createLocation(input: CreateLocationInput): Promise<FlatLocation> {
  const parent = input.parentId
    ? await prisma.location.findUnique({
        where: { id: input.parentId },
        select: { type: true, path: true },
      })
    : null;
  if (input.parentId && !parent) {
    throw new LocationServiceError("La ubicación superior no existe.");
  }

  const error = validateLocationPlacement(input.type, parent?.type ?? null);
  if (error) {
    throw new LocationServiceError(error);
  }

  try {
    return await prisma.location.create({
      data: {
        name: input.name,
        code: input.code,
        type: input.type,
        parentId: input.parentId,
        path: buildLocationPath(parent?.path ?? null, input.code),
      },
      select: { id: true, name: true, code: true, type: true, parentId: true, path: true },
    });
  } catch (caught) {
    if (isUniqueViolation(caught)) {
      throw new LocationServiceError(DUPLICATE_CODE);
    }
    throw caught;
  }
}

/**
 * Renames a location. When the code changes, the materialized path of the
 * location and of its whole subtree is rewritten in the same transaction.
 */
type Transaction = Prisma.TransactionClient;

/** Moves every descendant of `oldPath` under `newPath`. */
async function rewriteDescendantPaths(tx: Transaction, oldPath: string, newPath: string) {
  // Los códigos no admiten "%" ni "_", así que el prefijo no tiene comodines de LIKE.
  await tx.$executeRaw`
    UPDATE "location"
    SET "path" = ${newPath} || substr("path", ${oldPath.length + 1}::int),
        "updatedAt" = now()
    WHERE "path" LIKE ${`${oldPath}${PATH_SEPARATOR}%`}`;
}

type LockedLocation = {
  id: string;
  type: LocationType;
  code: string;
  path: string;
  parentId: string | null;
};

/**
 * Reads locations inside the transaction and locks their rows until it ends. The paths
 * of a subtree are rewritten from the path read here: read outside the transaction, a
 * rename and a move of the same branch at the same time left descendants with a stale
 * prefix. Rows are locked in id order so two transactions cannot deadlock.
 */
async function lockLocations(tx: Transaction, ids: readonly string[]) {
  const rows = await tx.$queryRaw<LockedLocation[]>`
    SELECT "id", "type"::text AS "type", "code", "path", "parentId"
    FROM "location" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
  return new Map(rows.map((row) => [row.id, row]));
}

export async function updateLocation(input: UpdateLocationInput): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const current = (await lockLocations(tx, [input.id])).get(input.id);
      if (!current) {
        throw new LocationServiceError("La ubicación no existe.");
      }
      const oldPath = current.path;
      const newPath = `${oldPath.slice(0, oldPath.length - current.code.length)}${input.code}`;

      await tx.location.update({
        where: { id: input.id },
        data: { name: input.name, code: input.code, path: newPath },
      });
      if (newPath !== oldPath) {
        await rewriteDescendantPaths(tx, oldPath, newPath);
      }
    });
  } catch (caught) {
    if (isUniqueViolation(caught)) {
      throw new LocationServiceError(DUPLICATE_CODE);
    }
    throw caught;
  }
}

/**
 * Moves a location (with its whole subtree) under another parent of the right
 * level: an area to another plant, a unit to another area, a site to another
 * unit. Plants stay at the root. Cables keep pointing at the same locations, so
 * only the materialized paths change.
 */
export async function moveLocation(input: MoveLocationInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const locked = await lockLocations(tx, [input.id, input.parentId]);
    const location = locked.get(input.id);
    const parent = locked.get(input.parentId);
    if (!location) {
      throw new LocationServiceError("La ubicación no existe.");
    }
    if (!parent) {
      throw new LocationServiceError("La ubicación de destino no existe.");
    }
    if (location.type === "PLANT") {
      throw new LocationServiceError("Las plantas no se pueden mover.");
    }
    if (location.parentId === input.parentId) {
      return;
    }
    // Imposible con la jerarquía por niveles, pero un ciclo rompería el árbol entero.
    if (isWithinPath(parent.path, location.path)) {
      throw new LocationServiceError("No se puede mover una ubicación dentro de sí misma.");
    }
    const error = validateLocationPlacement(location.type, parent.type);
    if (error) {
      throw new LocationServiceError(error);
    }

    const newPath = buildLocationPath(parent.path, location.code);
    await tx.location.update({
      where: { id: input.id },
      data: { parentId: input.parentId, path: newPath },
    });
    await rewriteDescendantPaths(tx, location.path, newPath);
  });
}

/** Deletes a location that has no sub-locations and is not referenced anywhere. */
export async function deleteLocation(id: string): Promise<void> {
  const location = await prisma.location.findUnique({
    where: { id },
    select: {
      _count: {
        select: {
          children: true,
          cablesFrom: true,
          cablesTo: true,
          cablesAt: true,
          eventsFrom: true,
          eventsTo: true,
        },
      },
    },
  });
  if (!location) {
    throw new LocationServiceError("La ubicación no existe.");
  }

  const counts = location._count;
  if (counts.children > 0) {
    throw new LocationServiceError("Primero elimina las ubicaciones que contiene.");
  }
  const references =
    counts.cablesFrom + counts.cablesTo + counts.cablesAt + counts.eventsFrom + counts.eventsTo;
  if (references > 0) {
    // Incluye cables dados de baja y eventos: el historial debe seguir apuntando aquí.
    throw new LocationServiceError(
      "No se puede eliminar: hay cables o movimientos que hacen referencia a esta ubicación.",
    );
  }

  try {
    await prisma.location.delete({ where: { id } });
  } catch (caught) {
    // Otra petición creó una referencia entre la comprobación y el borrado.
    if (isForeignKeyViolation(caught)) {
      throw new LocationServiceError("No se puede eliminar: la ubicación está en uso.");
    }
    throw caught;
  }
}

/** Ids of a location and all its descendants (filter "includes sub-locations"). */
export async function findSubtreeIds(id: string): Promise<string[]> {
  const root = await prisma.location.findUnique({ where: { id }, select: { path: true } });
  if (!root) {
    return [];
  }

  const locations = await prisma.location.findMany({
    where: {
      OR: [{ path: root.path }, { path: { startsWith: `${root.path}${PATH_SEPARATOR}` } }],
    },
    select: { id: true },
  });
  return locations.map((location) => location.id);
}

export type LocationDetail = {
  id: string;
  name: string;
  code: string;
  type: LocationType;
  /** From the plant down to the parent, for the breadcrumb. */
  ancestors: { id: string; name: string; code: string; type: LocationType }[];
  children: { id: string; name: string; code: string; type: LocationType }[];
  /** Active cables that start, end or are physically here or in anything it contains. */
  cables: number;
  /** Trays of this building or of the buildings it contains. */
  trays: number;
  /** The first cables, by code: enough for a room; a building links to the search instead. */
  someCables: {
    id: string;
    code: string;
    /** Whether it starts, ends or is stored here (or in something it contains). */
    roles: ("origin" | "destination" | "here")[];
    otherEnd: string | null;
  }[];
};

export const LOCATION_CABLE_LIST_SIZE = 25;

/** One location with where it is, what it contains and how many cables and trays it has. */
export async function getLocationDetail(id: string): Promise<LocationDetail | null> {
  const location = await prisma.location.findUnique({
    where: { id },
    select: { id: true, name: true, code: true, type: true, path: true },
  });
  if (!location) return null;
  const subtree = await findSubtreeIds(id);
  // The path is made of codes ("/80/80UB/80UBA"): each prefix is an ancestor.
  const codes = location.path.split(PATH_SEPARATOR).filter(Boolean);
  const ancestorPaths = codes
    .slice(0, -1)
    .map((_, index) => `${PATH_SEPARATOR}${codes.slice(0, index + 1).join(PATH_SEPARATOR)}`);
  const select = { id: true, name: true, code: true, type: true } as const;
  const inSubtree = {
    deletedAt: null,
    OR: [
      { originId: { in: subtree } },
      { destinationId: { in: subtree } },
      { currentLocationId: { in: subtree } },
    ],
  };
  const [ancestors, children, cables, trays, firstCables] = await Promise.all([
    prisma.location.findMany({
      where: { path: { in: ancestorPaths } },
      select: { ...select, path: true },
    }),
    prisma.location.findMany({ where: { parentId: id }, select, orderBy: { name: "asc" } }),
    prisma.cable.count({ where: inSubtree }),
    prisma.tray.count({ where: { locationId: { in: subtree } } }),
    prisma.cable.findMany({
      where: inSubtree,
      orderBy: { code: "asc" },
      take: LOCATION_CABLE_LIST_SIZE,
      select: {
        id: true,
        code: true,
        originId: true,
        destinationId: true,
        currentLocationId: true,
        originEquipment: true,
        destinationEquipment: true,
      },
    }),
  ]);
  const inside = new Set(subtree);
  const depth = (path: string) => path.split(PATH_SEPARATOR).length;
  return {
    id: location.id,
    name: location.name,
    code: location.code,
    type: location.type,
    ancestors: ancestors
      .sort((a, b) => depth(a.path) - depth(b.path))
      .map(({ path: _path, ...ancestor }) => ancestor),
    children,
    cables,
    trays,
    someCables: firstCables.map((cable) => {
      const roles: LocationDetail["someCables"][number]["roles"] = [];
      if (cable.originId && inside.has(cable.originId)) roles.push("origin");
      if (cable.destinationId && inside.has(cable.destinationId)) roles.push("destination");
      if (cable.currentLocationId && inside.has(cable.currentLocationId)) roles.push("here");
      // The other end: where it goes if it starts here, where it comes from if it ends here.
      const otherEnd =
        roles[0] === "origin"
          ? cable.destinationEquipment
          : roles[0] === "destination"
            ? cable.originEquipment
            : null;
      return { id: cable.id, code: cable.code, roles, otherEnd };
    }),
  };
}
