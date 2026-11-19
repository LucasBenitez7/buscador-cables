import "server-only";
import { prisma } from "@cables/db";
import type { saveItemsSchema, moveSavedItemsSchema } from "@cables/shared";
import {
  SAVED_FOLDERS_MAX,
  SAVED_ITEMS_MAX,
  type ConnectionStatus,
  type InstallationStatus,
  type SavedKind,
  type SavedRef,
  type TestStatus,
  type TrayKind,
} from "@cables/shared";
import type { z } from "zod";
import { isPrismaError } from "@/server/prisma-errors";

/** A message meant for the person (a name already used, a folder that is gone…). */
export class SavedServiceError extends Error {}

const ACTIVE = { deletedAt: null } as const;
const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "es", { numeric: true });
const byCode = (a: { code: string }, b: { code: string }) =>
  a.code.localeCompare(b.code, "es", { numeric: true });

export type SavedFolderSummary = {
  id: string;
  name: string;
  counts: Record<SavedKind, number>;
  total: number;
};

/** The folders of one person, by name, with how many things of each kind they hold. */
export async function listFolders(userId: string): Promise<SavedFolderSummary[]> {
  const [folders, counts] = await Promise.all([
    prisma.savedFolder.findMany({ where: { userId }, select: { id: true, name: true } }),
    prisma.savedItem.groupBy({
      by: ["folderId", "kind"],
      where: { folder: { userId } },
      _count: { _all: true },
    }),
  ]);
  return folders.sort(byName).map((folder) => {
    const of = (kind: SavedKind) =>
      counts.find((row) => row.folderId === folder.id && row.kind === kind)?._count._all ?? 0;
    const folderCounts = { CABLE: of("CABLE"), TRAY: of("TRAY"), EQUIPMENT: of("EQUIPMENT") };
    return {
      ...folder,
      counts: folderCounts,
      total: folderCounts.CABLE + folderCounts.TRAY + folderCounts.EQUIPMENT,
    };
  });
}

export type SavedCable = {
  itemId: string;
  id: string;
  code: string;
  originEquipment: string | null;
  destinationEquipment: string | null;
  installationStatus: InstallationStatus;
  connectionStatus: ConnectionStatus;
  testStatus: TestStatus;
  /** Dado de baja después de guardarlo: se ve, pero no se abre. */
  deleted: boolean;
};
export type SavedTray = {
  itemId: string;
  code: string;
  kind: TrayKind | null;
  voltageLevel: number | null;
};
export type SavedEquipment = { itemId: string; equipment: string; cables: number };

export type SavedFolderDetail = {
  id: string;
  name: string;
  cables: SavedCable[];
  trays: SavedTray[];
  equipment: SavedEquipment[];
};

/** One folder of this person with what it holds, each kind by code. Null if it is not theirs. */
export async function getFolder(userId: string, id: string): Promise<SavedFolderDetail | null> {
  const folder = await prisma.savedFolder.findFirst({
    where: { id, userId },
    select: { id: true, name: true, items: { select: { id: true, kind: true, key: true } } },
  });
  if (!folder) return null;
  const keysOf = (kind: SavedKind) =>
    folder.items.filter((item) => item.kind === kind).map((item) => item.key);
  const itemIdOf = (kind: SavedKind, key: string) =>
    folder.items.find((item) => item.kind === kind && item.key === key)!.id;

  const [cables, trays, equipment] = await Promise.all([
    prisma.cable.findMany({
      where: { id: { in: keysOf("CABLE") } },
      select: {
        id: true,
        code: true,
        originEquipment: true,
        destinationEquipment: true,
        installationStatus: true,
        connectionStatus: true,
        testStatus: true,
        deletedAt: true,
      },
    }),
    prisma.tray.findMany({
      where: { code: { in: keysOf("TRAY") } },
      select: { code: true, kind: true, voltageLevel: true },
    }),
    countEquipmentCables(keysOf("EQUIPMENT")),
  ]);

  const trayByCode = new Map(trays.map((tray) => [tray.code, tray]));
  return {
    id: folder.id,
    name: folder.name,
    cables: cables
      .map(({ deletedAt, ...cable }) => ({
        ...cable,
        itemId: itemIdOf("CABLE", cable.id),
        deleted: deletedAt !== null,
      }))
      .sort(byCode),
    // Una bandeja que ya no está en los planos se sigue viendo, con su código.
    trays: keysOf("TRAY")
      .map((code) => ({
        itemId: itemIdOf("TRAY", code),
        code,
        kind: trayByCode.get(code)?.kind ?? null,
        voltageLevel: trayByCode.get(code)?.voltageLevel ?? null,
      }))
      .sort(byCode),
    equipment: keysOf("EQUIPMENT")
      .map((tag) => ({
        itemId: itemIdOf("EQUIPMENT", tag),
        equipment: tag,
        cables: equipment.get(tag.toUpperCase()) ?? 0,
      }))
      .sort((a, b) => a.equipment.localeCompare(b.equipment, "es", { numeric: true })),
  };
}

/** Active cables at either end of each equipment (by tag, without case). */
async function countEquipmentCables(tags: string[]): Promise<Map<string, number>> {
  if (tags.length === 0) return new Map();
  const upper = tags.map((tag) => tag.toUpperCase());
  const rows = await prisma.$queryRaw<{ tag: string; cables: number }[]>`
    SELECT tag, count(*)::int AS cables FROM (
      SELECT upper("originEquipment") AS tag FROM cable
        WHERE "deletedAt" IS NULL AND upper("originEquipment") = ANY(${upper})
      UNION ALL
      SELECT upper("destinationEquipment") FROM cable
        WHERE "deletedAt" IS NULL AND upper("destinationEquipment") = ANY(${upper})
    ) ends GROUP BY tag`;
  return new Map(rows.map((row) => [row.tag, row.cables]));
}

/**
 * The folders of this person for the «Guardar» dialog, each with how many of `refs` it
 * already holds (all of them: ticked; some: half ticked).
 */
export async function foldersFor(
  userId: string,
  refs: SavedRef[],
): Promise<{ id: string; name: string; holds: number }[]> {
  const folders = await prisma.savedFolder.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      _count: { select: { items: { where: refsWhere(refs) } } },
    },
  });
  return folders
    .sort(byName)
    .map((folder) => ({ id: folder.id, name: folder.name, holds: folder._count.items }));
}

export async function createFolder(userId: string, name: string): Promise<{ id: string }> {
  if ((await prisma.savedFolder.count({ where: { userId } })) >= SAVED_FOLDERS_MAX) {
    throw new SavedServiceError(`No puedes tener más de ${SAVED_FOLDERS_MAX} carpetas.`);
  }
  try {
    return await prisma.savedFolder.create({ data: { userId, name }, select: { id: true } });
  } catch (error) {
    if (isPrismaError(error, "P2002")) {
      throw new SavedServiceError(`Ya tienes una carpeta «${name}».`);
    }
    throw error;
  }
}

export async function renameFolder(userId: string, id: string, name: string): Promise<void> {
  await ownFolder(userId, id);
  try {
    await prisma.savedFolder.update({ where: { id }, data: { name } });
  } catch (error) {
    if (isPrismaError(error, "P2002")) {
      throw new SavedServiceError(`Ya tienes una carpeta «${name}».`);
    }
    throw error;
  }
}

/** Deletes the folder and what it holds (only the folder: the cables stay as they are). */
export async function deleteFolder(userId: string, id: string): Promise<{ name: string }> {
  const folder = await ownFolder(userId, id);
  await prisma.savedFolder.delete({ where: { id } });
  return { name: folder.name };
}

/**
 * Puts `refs` in the folders of `add` (and in a new one, `newFolder`) and takes them out of
 * those of `remove`. What no longer exists (a cable deleted, a tray or equipment unknown) is
 * not saved. Returns how many things were saved and the folders they went to.
 */
export async function saveItems(
  userId: string,
  input: z.output<typeof saveItemsSchema>,
): Promise<{ saved: number; folders: string[] }> {
  const refs = await existingRefs(dedupe(input.refs));
  if (refs.length === 0 && input.remove.length === 0) {
    throw new SavedServiceError("Lo elegido ya no existe.");
  }
  const owned = await prisma.savedFolder.findMany({
    where: { userId, id: { in: [...input.add, ...input.remove] } },
    select: { id: true, name: true },
  });
  if (owned.length !== new Set([...input.add, ...input.remove]).size) {
    throw new SavedServiceError("Esa carpeta ya no existe.");
  }
  const targets = owned.filter((folder) => input.add.includes(folder.id));
  if (input.newFolder) {
    const created = await createFolder(userId, input.newFolder);
    targets.push({ id: created.id, name: input.newFolder });
  }

  await prisma.$transaction(async (tx) => {
    for (const folder of targets) {
      const held = await tx.savedItem.count({ where: { folderId: folder.id } });
      if (held + refs.length > SAVED_ITEMS_MAX) {
        throw new SavedServiceError(
          `«${folder.name}» no puede tener más de ${SAVED_ITEMS_MAX} cosas guardadas.`,
        );
      }
      await tx.savedItem.createMany({
        data: refs.map((ref) => ({ folderId: folder.id, ...ref })),
        skipDuplicates: true,
      });
    }
    if (input.remove.length > 0) {
      await tx.savedItem.deleteMany({
        where: {
          folderId: { in: input.remove },
          ...refsWhere(input.refs),
        },
      });
    }
  });
  return { saved: refs.length, folders: targets.map((folder) => folder.name) };
}

/** Takes items out of a folder of this person or moves them to another of their folders. */
export async function moveItems(
  userId: string,
  input: z.output<typeof moveSavedItemsSchema>,
): Promise<{ moved: number; to: string | null }> {
  await ownFolder(userId, input.folderId);
  const target = input.toFolderId ? await ownFolder(userId, input.toFolderId) : null;
  if (target && target.id === input.folderId) {
    throw new SavedServiceError("Ya están en esa carpeta.");
  }
  const items = await prisma.savedItem.findMany({
    where: { folderId: input.folderId, id: { in: input.itemIds } },
    select: { id: true, kind: true, key: true },
  });
  await prisma.$transaction(async (tx) => {
    if (target) {
      await tx.savedItem.createMany({
        data: items.map((item) => ({ folderId: target.id, kind: item.kind, key: item.key })),
        skipDuplicates: true,
      });
    }
    await tx.savedItem.deleteMany({ where: { id: { in: items.map((item) => item.id) } } });
  });
  return { moved: items.length, to: target?.name ?? null };
}

async function ownFolder(userId: string, id: string): Promise<{ id: string; name: string }> {
  const folder = await prisma.savedFolder.findFirst({
    where: { id, userId },
    select: { id: true, name: true },
  });
  if (!folder) throw new SavedServiceError("Esa carpeta ya no existe.");
  return folder;
}

/** `refs` as one condition per kind (`key IN (…)`), not one per thing: there may be thousands. */
function refsWhere(refs: SavedRef[]) {
  const kinds = [...new Set(refs.map((ref) => ref.kind))];
  return {
    OR: kinds.map((kind) => ({
      kind,
      key: { in: refs.filter((ref) => ref.kind === kind).map((ref) => ref.key) },
    })),
  };
}

function dedupe(refs: SavedRef[]): SavedRef[] {
  return [...new Map(refs.map((ref) => [`${ref.kind}:${ref.key}`, ref])).values()];
}

/** Only what exists: active cables (by id), trays (by code) and equipment with cables. */
async function existingRefs(refs: SavedRef[]): Promise<SavedRef[]> {
  const keys = (kind: SavedKind) => refs.filter((ref) => ref.kind === kind).map((ref) => ref.key);
  const [cables, trays, equipment] = await Promise.all([
    prisma.cable.findMany({
      where: { id: { in: keys("CABLE") }, ...ACTIVE },
      select: { id: true },
    }),
    prisma.tray.findMany({ where: { code: { in: keys("TRAY") } }, select: { code: true } }),
    countEquipmentCables(keys("EQUIPMENT")),
  ]);
  const found = new Set([
    ...cables.map((cable) => `CABLE:${cable.id}`),
    ...trays.map((tray) => `TRAY:${tray.code}`),
    ...[...equipment.keys()].map((tag) => `EQUIPMENT:${tag}`),
  ]);
  return refs.filter((ref) =>
    found.has(
      ref.kind === "EQUIPMENT" ? `EQUIPMENT:${ref.key.toUpperCase()}` : `${ref.kind}:${ref.key}`,
    ),
  );
}
