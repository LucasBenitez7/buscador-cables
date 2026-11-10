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
  type MoveLocationInput,
  type UpdateLocationInput,
} from "@cables/shared";

export class LocationServiceError extends Error {}

export type LocationWithCounts = FlatLocation & {
  /**
   * Cables distintos (sin contar bajas) que salen, llegan o están físicamente en
   * esta ubicación o en cualquiera de las que contiene.
   */
  cableCount: number;
};

const DUPLICATE_CODE = "Ya existe una ubicación con ese código.";

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

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

export async function updateLocation(input: UpdateLocationInput): Promise<void> {
  const current = await prisma.location.findUnique({
    where: { id: input.id },
    select: { code: true, path: true },
  });
  if (!current) {
    throw new LocationServiceError("La ubicación no existe.");
  }

  const oldPath = current.path;
  const newPath = `${oldPath.slice(0, oldPath.length - current.code.length)}${input.code}`;

  try {
    await prisma.$transaction(async (tx) => {
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
  const [location, parent] = await Promise.all([
    prisma.location.findUnique({
      where: { id: input.id },
      select: { type: true, code: true, path: true, parentId: true },
    }),
    prisma.location.findUnique({
      where: { id: input.parentId },
      select: { type: true, path: true },
    }),
  ]);
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
  await prisma.$transaction(async (tx) => {
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
    if (caught instanceof Prisma.PrismaClientKnownRequestError && caught.code === "P2003") {
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
