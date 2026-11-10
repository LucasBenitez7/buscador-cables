import { randomUUID } from "node:crypto";
import { prisma } from "@cables/db";
import { beforeEach, describe, expect, it } from "vitest";
import {
  LocationServiceError,
  createLocation,
  deleteLocation,
  findSubtreeIds,
  listLocationTree,
  updateLocation,
} from "./service";

async function reset() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "cable_event", "cable", "location", "cable_type", "color", "manufacturer", "user" CASCADE',
  );
}

/** Planta PL → Área A1 → Unidad R-X → Sitio S-XZ, más un Área A10 hermana. */
async function seedTree() {
  const plant = await createLocation({ name: "Planta", code: "PL", type: "PLANT", parentId: null });
  const area = await createLocation({
    name: "Área 1",
    code: "A1",
    type: "AREA",
    parentId: plant.id,
  });
  const sibling = await createLocation({
    name: "Área 10",
    code: "A10",
    type: "AREA",
    parentId: plant.id,
  });
  const unit = await createLocation({
    name: "Reactor X",
    code: "R-X",
    type: "UNIT",
    parentId: area.id,
  });
  const site = await createLocation({
    name: "Sitio XZ",
    code: "S-XZ",
    type: "SITE",
    parentId: unit.id,
  });
  return { plant, area, sibling, unit, site };
}

async function pathOf(id: string) {
  return (await prisma.location.findUniqueOrThrow({ where: { id } })).path;
}

beforeEach(reset);

describe("createLocation", () => {
  it("builds materialized paths from the codes", async () => {
    const { site } = await seedTree();

    expect(site.path).toBe("/PL/A1/R-X/S-XZ");
  });

  it("enforces the Planta → Área → Unidad → Sitio hierarchy", async () => {
    const { plant, site } = await seedTree();

    await expect(
      createLocation({ name: "Reactor", code: "R-Y", type: "UNIT", parentId: plant.id }),
    ).rejects.toThrow(/solo se puede crear: área/);
    await expect(
      createLocation({ name: "Hueco", code: "H", type: "SITE", parentId: site.id }),
    ).rejects.toThrow(/sitio no puede contener/);
    await expect(
      createLocation({ name: "Suelta", code: "SU", type: "AREA", parentId: null }),
    ).rejects.toThrow(/Solo las plantas/);
  });

  it("rejects a missing parent and duplicate codes", async () => {
    await seedTree();

    await expect(
      createLocation({ name: "X", code: "X", type: "AREA", parentId: "missing" }),
    ).rejects.toThrow(/superior no existe/);
    await expect(
      createLocation({ name: "Otra", code: "PL", type: "PLANT", parentId: null }),
    ).rejects.toThrow(new LocationServiceError("Ya existe una ubicación con ese código."));
  });
});

describe("updateLocation", () => {
  it("renames without touching paths when the code is unchanged", async () => {
    const { area, site } = await seedTree();

    await updateLocation({ id: area.id, name: "Área norte", code: "A1" });

    const updated = await prisma.location.findUniqueOrThrow({ where: { id: area.id } });
    expect(updated.name).toBe("Área norte");
    expect(await pathOf(site.id)).toBe("/PL/A1/R-X/S-XZ");
  });

  it("rewrites the path of the whole subtree when the code changes", async () => {
    const { area, unit, site, sibling } = await seedTree();

    await updateLocation({ id: area.id, name: "Área 1", code: "AREA-1" });

    expect(await pathOf(area.id)).toBe("/PL/AREA-1");
    expect(await pathOf(unit.id)).toBe("/PL/AREA-1/R-X");
    expect(await pathOf(site.id)).toBe("/PL/AREA-1/R-X/S-XZ");
    // Una hermana cuyo código empieza igual ("A10") no se toca.
    expect(await pathOf(sibling.id)).toBe("/PL/A10");
  });

  it("rejects a code already used by another location and leaves everything as it was", async () => {
    const { area, site } = await seedTree();

    await expect(updateLocation({ id: area.id, name: "Área 1", code: "A10" })).rejects.toThrow(
      /Ya existe/,
    );
    expect(await pathOf(site.id)).toBe("/PL/A1/R-X/S-XZ");
  });
});

describe("deleteLocation", () => {
  it("deletes an unused leaf", async () => {
    const { site } = await seedTree();

    await deleteLocation(site.id);

    expect(await prisma.location.count({ where: { id: site.id } })).toBe(0);
  });

  it("refuses to delete a location with children", async () => {
    const { area } = await seedTree();

    await expect(deleteLocation(area.id)).rejects.toThrow(/Primero elimina/);
  });

  it("refuses to delete a location referenced by a cable, even a retired one", async () => {
    const { site } = await seedTree();
    await prisma.cable.create({
      data: { code: "SH-50", destinationId: site.id, deletedAt: new Date() },
    });

    await expect(deleteLocation(site.id)).rejects.toThrow(/hacen referencia/);
  });

  it("refuses to delete a location that appears in the history", async () => {
    const { site } = await seedTree();
    const user = await prisma.user.create({
      data: { id: randomUUID(), name: "Ana", email: "ana@cables.test" },
    });
    const cable = await prisma.cable.create({ data: { code: "SH-51" } });
    await prisma.cableEvent.create({
      data: {
        cableId: cable.id,
        userId: user.id,
        action: "MOVED",
        toLocationId: site.id,
        changes: {},
      },
    });

    await expect(deleteLocation(site.id)).rejects.toThrow(/hacen referencia/);
  });
});

describe("listLocationTree and findSubtreeIds", () => {
  it("returns the nested tree with active cable counts", async () => {
    const { unit } = await seedTree();
    await prisma.cable.createMany({
      data: [
        { code: "SH-1", originId: unit.id },
        { code: "SH-2", destinationId: unit.id },
        { code: "SH-3", originId: unit.id, deletedAt: new Date() },
      ],
    });

    const [plant] = await listLocationTree();
    const area = plant?.children.find((node) => node.code === "A1");

    expect(plant?.children.map((node) => node.code)).toEqual(["A1", "A10"]);
    expect(area?.children[0]).toMatchObject({ code: "R-X", cableCount: 2 });
  });

  it("selects a subtree without its siblings", async () => {
    const { area, unit, site, sibling } = await seedTree();

    const ids = await findSubtreeIds(area.id);

    expect(ids.sort()).toEqual([area.id, unit.id, site.id].sort());
    expect(ids).not.toContain(sibling.id);
    expect(await findSubtreeIds("missing")).toEqual([]);
  });
});
