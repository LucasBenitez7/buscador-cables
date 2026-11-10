import "server-only";
import { Prisma, prisma } from "@cables/db";
import {
  PATH_SEPARATOR,
  buildLocationPath,
  buildLocationTree,
  validateLocationPlacement,
  type CreateLocationInput,
  type FlatLocation,
  type LocationNode,
  type UpdateLocationInput,
} from "@cables/shared";

export class LocationServiceError extends Error {}

export type LocationWithCounts = FlatLocation & {
  /** Cables que salen, llegan o están físicamente en esta ubicación (sin contar bajas). */
  cableCount: number;
};

const DUPLICATE_CODE = "Ya existe una ubicación con ese código.";

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function listLocationTree(): Promise<LocationNode<LocationWithCounts>[]> {
  const notDeleted = { where: { deletedAt: null } };
  const locations = await prisma.location.findMany({
    select: {
      id: true,
      name: true,
      code: true,
      type: true,
      parentId: true,
      path: true,
      _count: { select: { cablesFrom: notDeleted, cablesTo: notDeleted, cablesAt: notDeleted } },
    },
  });

  return buildLocationTree(
    locations.map(({ _count, ...location }) => ({
      ...location,
      cableCount: _count.cablesFrom + _count.cablesTo + _count.cablesAt,
    })),
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
        // Los códigos no admiten "%" ni "_", así que el prefijo no tiene comodines de LIKE.
        await tx.$executeRaw`
          UPDATE "location"
          SET "path" = ${newPath} || substr("path", ${oldPath.length + 1}::int),
              "updatedAt" = now()
          WHERE "path" LIKE ${`${oldPath}${PATH_SEPARATOR}%`}`;
      }
    });
  } catch (caught) {
    if (isUniqueViolation(caught)) {
      throw new LocationServiceError(DUPLICATE_CODE);
    }
    throw caught;
  }
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
