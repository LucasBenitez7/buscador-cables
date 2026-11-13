import "server-only";
import { prisma } from "@cables/db";
import {
  CATALOG_LABELS,
  type CatalogItem,
  type CatalogKind,
  type CreateCatalogItemInput,
  type UpdateCatalogItemInput,
} from "@cables/shared";
import { isPrismaError } from "@/server/prisma-errors";

export class CatalogServiceError extends Error {}

type ItemData = { name: string; hex: string | null };

/** Same operations for the three catalog tables. Only colors store `hex`. */
type CatalogStore = {
  list(): Promise<CatalogItem[]>;
  findByName(name: string): Promise<{ id: string } | null>;
  create(data: ItemData): Promise<CatalogItem>;
  update(id: string, data: ItemData): Promise<void>;
  /** Null when the item does not exist. */
  countCables(id: string): Promise<number | null>;
  remove(id: string): Promise<void>;
};

const byName = { orderBy: { name: "asc" } } as const;
const withCount = { _count: { select: { cables: true } } } as const;
const insensitive = (name: string) => ({ name: { equals: name, mode: "insensitive" as const } });

function toItem(row: {
  id: string;
  name: string;
  hex?: string | null;
  _count: { cables: number };
}): CatalogItem {
  return { id: row.id, name: row.name, hex: row.hex ?? null, cableCount: row._count.cables };
}

const stores: Record<CatalogKind, CatalogStore> = {
  cableType: {
    list: async () =>
      (await prisma.cableType.findMany({ ...byName, include: withCount })).map(toItem),
    findByName: (name) =>
      prisma.cableType.findFirst({ where: insensitive(name), select: { id: true } }),
    create: async ({ name }) =>
      toItem(await prisma.cableType.create({ data: { name }, include: withCount })),
    update: async (id, { name }) => {
      await prisma.cableType.update({ where: { id }, data: { name } });
    },
    countCables: async (id) =>
      (await prisma.cableType.findUnique({ where: { id }, include: withCount }))?._count.cables ??
      null,
    remove: async (id) => {
      await prisma.cableType.delete({ where: { id } });
    },
  },
  color: {
    list: async () => (await prisma.color.findMany({ ...byName, include: withCount })).map(toItem),
    findByName: (name) =>
      prisma.color.findFirst({ where: insensitive(name), select: { id: true } }),
    create: async (data) => toItem(await prisma.color.create({ data, include: withCount })),
    update: async (id, data) => {
      await prisma.color.update({ where: { id }, data });
    },
    countCables: async (id) =>
      (await prisma.color.findUnique({ where: { id }, include: withCount }))?._count.cables ?? null,
    remove: async (id) => {
      await prisma.color.delete({ where: { id } });
    },
  },
  manufacturer: {
    list: async () =>
      (await prisma.manufacturer.findMany({ ...byName, include: withCount })).map(toItem),
    findByName: (name) =>
      prisma.manufacturer.findFirst({ where: insensitive(name), select: { id: true } }),
    create: async ({ name }) =>
      toItem(await prisma.manufacturer.create({ data: { name }, include: withCount })),
    update: async (id, { name }) => {
      await prisma.manufacturer.update({ where: { id }, data: { name } });
    },
    countCables: async (id) =>
      (await prisma.manufacturer.findUnique({ where: { id }, include: withCount }))?._count
        .cables ?? null,
    remove: async (id) => {
      await prisma.manufacturer.delete({ where: { id } });
    },
  },
};

function duplicate(kind: CatalogKind): CatalogServiceError {
  return new CatalogServiceError(
    `Ya existe un elemento con ese nombre en ${CATALOG_LABELS[kind].plural.toLowerCase()}.`,
  );
}

export type Catalogs = Record<CatalogKind, CatalogItem[]>;

export async function listCatalogs(): Promise<Catalogs> {
  const [cableType, color, manufacturer] = await Promise.all([
    stores.cableType.list(),
    stores.color.list(),
    stores.manufacturer.list(),
  ]);
  return { cableType, color, manufacturer };
}

export async function createCatalogItem(input: CreateCatalogItemInput): Promise<CatalogItem> {
  const store = stores[input.kind];
  // El índice único distingue mayúsculas; "Rojo" y "rojo" serían dos colores.
  if (await store.findByName(input.name)) {
    throw duplicate(input.kind);
  }
  try {
    return await store.create({ name: input.name, hex: input.hex });
  } catch (error) {
    if (isPrismaError(error, "P2002")) {
      throw duplicate(input.kind);
    }
    throw error;
  }
}

export async function updateCatalogItem(input: UpdateCatalogItemInput): Promise<void> {
  const store = stores[input.kind];
  const clash = await store.findByName(input.name);
  if (clash && clash.id !== input.id) {
    throw duplicate(input.kind);
  }
  try {
    await store.update(input.id, { name: input.name, hex: input.hex });
  } catch (error) {
    if (isPrismaError(error, "P2025")) {
      throw new CatalogServiceError("El elemento no existe.");
    }
    if (isPrismaError(error, "P2002")) {
      throw duplicate(input.kind);
    }
    throw error;
  }
}

/** Deletes an item that no cable uses (retired cables included, to keep their data). */
export async function deleteCatalogItem(kind: CatalogKind, id: string): Promise<void> {
  const store = stores[kind];
  const cables = await store.countCables(id);
  if (cables === null) {
    throw new CatalogServiceError("El elemento no existe.");
  }
  if (cables > 0) {
    throw new CatalogServiceError(
      `No se puede eliminar: lo ${cables === 1 ? "usa 1 cable" : `usan ${cables} cables`}.`,
    );
  }
  try {
    await store.remove(id);
  } catch (error) {
    if (isPrismaError(error, "P2003")) {
      throw new CatalogServiceError("No se puede eliminar: está en uso.");
    }
    throw error;
  }
}
