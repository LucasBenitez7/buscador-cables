import { prisma } from "@cables/db";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CatalogServiceError,
  createCatalogItem,
  deleteCatalogItem,
  listCatalogs,
  updateCatalogItem,
} from "./service";

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "cable_event", "cable", "tray", "location", "cable_type", "color", "manufacturer", "user" CASCADE',
  );
});

describe("catalog service", () => {
  it("creates items in each catalog and lists them sorted with usage counts", async () => {
    const control = await createCatalogItem({ kind: "cableType", name: "Control", hex: null });
    await createCatalogItem({ kind: "cableType", name: "Alimentación", hex: null });
    const red = await createCatalogItem({ kind: "color", name: "Rojo", hex: "#C0392B" });
    await createCatalogItem({ kind: "manufacturer", name: "Prysmian", hex: "#000000" });
    await prisma.cable.create({ data: { code: "SH-1", typeId: control.id, colorId: red.id } });

    const catalogs = await listCatalogs();

    expect(catalogs.cableType.map((item) => item.name)).toEqual(["Alimentación", "Control"]);
    expect(catalogs.cableType[1]).toMatchObject({ name: "Control", cableCount: 1, hex: null });
    expect(catalogs.color[0]).toMatchObject({ name: "Rojo", hex: "#C0392B", cableCount: 1 });
    // Solo los colores guardan el hex.
    expect(catalogs.manufacturer[0]).toMatchObject({ name: "Prysmian", hex: null });
  });

  it("rejects duplicates ignoring case", async () => {
    await createCatalogItem({ kind: "color", name: "Rojo", hex: null });

    await expect(createCatalogItem({ kind: "color", name: "ROJO", hex: null })).rejects.toThrow(
      new CatalogServiceError("Ya existe un elemento con ese nombre en colores."),
    );
    // El mismo nombre en otro catálogo sí se permite.
    await expect(
      createCatalogItem({ kind: "manufacturer", name: "Rojo", hex: null }),
    ).resolves.toMatchObject({ name: "Rojo" });
  });

  // Revisión F0-F7 (B7): la unicidad sin distinguir mayúsculas era solo una lectura previa
  // y dos altas simultáneas ("Rojo" y "rojo") entraban las dos.
  it("keeps one item when the same name is created twice at once in different case", async () => {
    const results = await Promise.allSettled([
      createCatalogItem({ kind: "color", name: "Rojo", hex: null }),
      createCatalogItem({ kind: "color", name: "rojo", hex: null }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect((rejected as PromiseRejectedResult | undefined)?.reason).toEqual(
      new CatalogServiceError("Ya existe un elemento con ese nombre en colores."),
    );
    expect(await prisma.color.count()).toBe(1);
  });

  it("the database itself refuses a name that only differs in case", async () => {
    await prisma.manufacturer.create({ data: { name: "Prysmian" } });

    await expect(prisma.manufacturer.create({ data: { name: "PRYSMIAN" } })).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("renames an item, allowing a change of case but not a clash with another", async () => {
    const blue = await createCatalogItem({ kind: "color", name: "azul", hex: null });
    await createCatalogItem({ kind: "color", name: "Verde", hex: null });

    await updateCatalogItem({ kind: "color", id: blue.id, name: "Azul", hex: "#2E86C1" });
    await expect(
      updateCatalogItem({ kind: "color", id: blue.id, name: "verde", hex: null }),
    ).rejects.toThrow(/Ya existe/);

    expect(await prisma.color.findUniqueOrThrow({ where: { id: blue.id } })).toMatchObject({
      name: "Azul",
      hex: "#2E86C1",
    });
  });

  it("reports a missing item", async () => {
    await expect(
      updateCatalogItem({ kind: "manufacturer", id: "missing", name: "X", hex: null }),
    ).rejects.toThrow("El elemento no existe.");
    await expect(deleteCatalogItem("cableType", "missing")).rejects.toThrow(
      "El elemento no existe.",
    );
  });

  it("deletes unused items and protects items used by cables, even retired ones", async () => {
    const used = await createCatalogItem({ kind: "manufacturer", name: "Nexans", hex: null });
    const unused = await createCatalogItem({
      kind: "manufacturer",
      name: "General Cable",
      hex: null,
    });
    await prisma.cable.create({
      data: { code: "SH-2", manufacturerId: used.id, deletedAt: new Date() },
    });

    await deleteCatalogItem("manufacturer", unused.id);
    await expect(deleteCatalogItem("manufacturer", used.id)).rejects.toThrow(
      "No se puede eliminar: lo usa 1 cable.",
    );

    expect((await listCatalogs()).manufacturer.map((item) => item.name)).toEqual(["Nexans"]);
  });
});
