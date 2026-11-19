import { prisma } from "@cables/db";
import { SAVED_ITEMS_MAX, saveItemsSchema, type SaveItemsInput } from "@cables/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  SavedServiceError,
  createFolder,
  deleteFolder,
  foldersFor,
  getFolder,
  listFolders,
  moveItems,
  renameFolder,
  saveItems,
} from "./service";

const save = (userId: string, input: SaveItemsInput) =>
  saveItems(userId, saveItemsSchema.parse(input));

const cable = (key: string) => ({ kind: "CABLE" as const, key });

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "saved_item", "saved_folder", "cable_event", "cable", "tray", "user" CASCADE',
  );
  await prisma.user.createMany({
    data: [
      { id: "juan", name: "Juan Pérez", email: "juan@cables.test", role: "TECHNICIAN" },
      { id: "ana", name: "Ana Ruiz", email: "ana@cables.test", role: "VIEWER" },
    ],
  });
  await prisma.cable.createMany({
    data: [
      { id: "c1", code: "99XAT10W2010", originEquipment: "99BMA", destinationEquipment: "99XAT10" },
      { id: "c2", code: "99XAT10W2002", originEquipment: "99BMA" },
      { id: "c3", code: "99XAT10W2003", deletedAt: new Date() },
    ],
  });
  await prisma.tray.create({ data: { code: "99UXA00L22036", kind: "LADDER", voltageLevel: 2 } });
});

describe("folders", () => {
  it("creates, renames and lists the folders of each person, by name", async () => {
    const { id } = await createFolder("juan", "Pendientes del lunes");
    await createFolder("juan", "Armario 99BMA");
    await createFolder("ana", "La de Ana");
    await renameFolder("juan", id, "Pendientes del martes");

    expect((await listFolders("juan")).map((folder) => folder.name)).toEqual([
      "Armario 99BMA",
      "Pendientes del martes",
    ]);
    expect((await listFolders("ana")).map((folder) => folder.name)).toEqual(["La de Ana"]);
  });

  it("does not repeat a name for the same person", async () => {
    await createFolder("juan", "Armario 99BMA");

    await expect(createFolder("juan", "Armario 99BMA")).rejects.toThrow(
      "Ya tienes una carpeta «Armario 99BMA».",
    );
    await expect(createFolder("ana", "Armario 99BMA")).resolves.toBeTruthy();
  });

  it("never lets anyone see, rename or delete a folder of someone else", async () => {
    const { id } = await createFolder("juan", "Armario 99BMA");

    expect(await getFolder("ana", id)).toBeNull();
    await expect(renameFolder("ana", id, "Mía")).rejects.toBeInstanceOf(SavedServiceError);
    await expect(deleteFolder("ana", id)).rejects.toBeInstanceOf(SavedServiceError);
    await expect(save("ana", { refs: [cable("c1")], add: [id] })).rejects.toThrow(
      "Esa carpeta ya no existe.",
    );
  });

  it("deleting a folder takes what it holds, but never the cables", async () => {
    const { id } = await createFolder("juan", "Armario 99BMA");
    await save("juan", { refs: [cable("c1")], add: [id] });

    await deleteFolder("juan", id);

    expect(await prisma.savedItem.count()).toBe(0);
    expect(await prisma.cable.count({ where: { id: "c1" } })).toBe(1);
  });
});

describe("saveItems", () => {
  it("saves cables, trays and equipment; a thing goes once per folder but in several", async () => {
    const a = await createFolder("juan", "A");
    const b = await createFolder("juan", "B");
    await save("juan", { refs: [cable("c1"), cable("c2")], add: [a.id] });
    const result = await save("juan", {
      refs: [
        cable("c1"),
        { kind: "TRAY", key: "99UXA00L22036" },
        { kind: "EQUIPMENT", key: "99bma" },
      ],
      add: [a.id, b.id],
    });

    expect(result).toEqual({ saved: 3, folders: ["A", "B"] });
    const folder = await getFolder("juan", a.id);
    expect(folder?.cables.map((item) => item.code)).toEqual(["99XAT10W2002", "99XAT10W2010"]);
    expect(folder?.trays).toEqual([
      expect.objectContaining({ code: "99UXA00L22036", kind: "LADDER", voltageLevel: 2 }),
    ]);
    // El equipo, sin importar mayúsculas: dos cables llegan a 99BMA.
    expect(folder?.equipment).toEqual([expect.objectContaining({ equipment: "99BMA", cables: 2 })]);
    expect((await listFolders("juan")).find((f) => f.id === b.id)?.counts).toEqual({
      CABLE: 1,
      TRAY: 1,
      EQUIPMENT: 1,
    });
  });

  it("does not save what does not exist or was deleted", async () => {
    const { id } = await createFolder("juan", "A");

    await expect(
      save("juan", {
        refs: [cable("c3"), cable("nada"), { kind: "TRAY", key: "99NO" }],
        add: [id],
      }),
    ).rejects.toThrow("Lo elegido ya no existe.");
    expect(await prisma.savedItem.count()).toBe(0);
  });

  it("creates a new folder while saving, and takes things out of the unticked ones", async () => {
    const a = await createFolder("juan", "A");
    await save("juan", { refs: [cable("c1"), cable("c2")], add: [a.id] });

    const result = await save("juan", {
      refs: [cable("c1")],
      remove: [a.id],
      newFolder: "Nueva",
    });

    expect(result.folders).toEqual(["Nueva"]);
    expect((await getFolder("juan", a.id))?.cables.map((item) => item.id)).toEqual(["c2"]);
  });

  it("tells for the dialog how many of the things each folder already holds", async () => {
    const a = await createFolder("juan", "A");
    await createFolder("juan", "B");
    await save("juan", { refs: [cable("c1")], add: [a.id] });

    expect(await foldersFor("juan", [cable("c1"), cable("c2")])).toEqual([
      { id: a.id, name: "A", holds: 1 },
      expect.objectContaining({ name: "B", holds: 0 }),
    ]);
  });

  it("keeps showing a cable deleted after it was saved", async () => {
    const { id } = await createFolder("juan", "A");
    await save("juan", { refs: [cable("c1")], add: [id] });
    await prisma.cable.update({ where: { id: "c1" }, data: { deletedAt: new Date() } });

    expect((await getFolder("juan", id))?.cables).toEqual([
      expect.objectContaining({ code: "99XAT10W2010", deleted: true }),
    ]);
  });
});

describe("saveItems: repaso antes de la release", () => {
  /** Fills a folder up to the limit with made-up trays (only the count matters). */
  const fill = (folderId: string, count: number) =>
    prisma.savedItem.createMany({
      data: Array.from({ length: count }, (_, n) => ({
        folderId,
        kind: "TRAY" as const,
        key: `99RELLENO${n}`,
      })),
    });

  it("a «new» folder with the name of one already there saves in it", async () => {
    const { id } = await createFolder("juan", "Armario 99BMA");

    const result = await save("juan", { refs: [cable("c1")], newFolder: "Armario 99BMA" });

    expect(result.folders).toEqual(["Armario 99BMA"]);
    expect((await getFolder("juan", id))?.cables.map((item) => item.id)).toEqual(["c1"]);
    expect(await prisma.savedFolder.count({ where: { userId: "juan" } })).toBe(1);
  });

  it("leaves no empty new folder behind when saving fails", async () => {
    const full = await createFolder("juan", "Llena");
    await fill(full.id, SAVED_ITEMS_MAX);

    await expect(
      save("juan", { refs: [cable("c1")], add: [full.id], newFolder: "Nueva" }),
    ).rejects.toThrow(/no puede tener más de/);
    expect((await listFolders("juan")).map((folder) => folder.name)).toEqual(["Llena"]);
  });

  it("does not count what a full folder already holds", async () => {
    const full = await createFolder("juan", "Llena");
    await fill(full.id, SAVED_ITEMS_MAX - 1);
    await save("juan", { refs: [cable("c1")], add: [full.id] });

    await expect(save("juan", { refs: [cable("c1")], add: [full.id] })).resolves.toBeTruthy();
  });

  it("saves an equipment once, whatever its case", async () => {
    const { id } = await createFolder("juan", "A");
    await save("juan", { refs: [{ kind: "EQUIPMENT", key: "99bma" }], add: [id] });
    await save("juan", { refs: [{ kind: "EQUIPMENT", key: "99BMA" }], add: [id] });

    expect((await getFolder("juan", id))?.equipment).toEqual([
      expect.objectContaining({ equipment: "99BMA", cables: 2 }),
    ]);
  });
});

describe("moveItems", () => {
  it("never fills the other folder past the limit", async () => {
    const a = await createFolder("juan", "A");
    const full = await createFolder("juan", "Llena");
    await prisma.savedItem.createMany({
      data: Array.from({ length: SAVED_ITEMS_MAX }, (_, n) => ({
        folderId: full.id,
        kind: "TRAY" as const,
        key: `99RELLENO${n}`,
      })),
    });
    await save("juan", { refs: [cable("c1")], add: [a.id] });
    const [item] = (await getFolder("juan", a.id))!.cables;

    await expect(
      moveItems("juan", { folderId: a.id, itemIds: [item!.itemId], toFolderId: full.id }),
    ).rejects.toThrow(/no puede tener más de/);
    expect((await getFolder("juan", a.id))?.cables).toHaveLength(1);
  });

  it("moves to another folder of the same person, or takes out", async () => {
    const a = await createFolder("juan", "A");
    const b = await createFolder("juan", "B");
    await save("juan", { refs: [cable("c1"), cable("c2")], add: [a.id] });
    const items = (await getFolder("juan", a.id))!.cables;

    expect(
      await moveItems("juan", { folderId: a.id, itemIds: [items[0]!.itemId], toFolderId: b.id }),
    ).toEqual({ moved: 1, to: "B" });
    expect(await moveItems("juan", { folderId: a.id, itemIds: [items[1]!.itemId] })).toEqual({
      moved: 1,
      to: null,
    });

    expect((await getFolder("juan", a.id))?.cables).toEqual([]);
    expect((await getFolder("juan", b.id))?.cables.map((item) => item.code)).toEqual([
      "99XAT10W2002",
    ]);
  });

  it("never moves into a folder of someone else", async () => {
    const a = await createFolder("juan", "A");
    const other = await createFolder("ana", "De Ana");
    await save("juan", { refs: [cable("c1")], add: [a.id] });
    const [item] = (await getFolder("juan", a.id))!.cables;

    await expect(
      moveItems("juan", { folderId: a.id, itemIds: [item!.itemId], toFolderId: other.id }),
    ).rejects.toThrow("Esa carpeta ya no existe.");
    expect(await prisma.savedItem.count({ where: { folderId: other.id } })).toBe(0);
  });
});
