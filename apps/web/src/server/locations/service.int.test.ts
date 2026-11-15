import { randomUUID } from "node:crypto";
import { prisma } from "@cables/db";
import { beforeEach, describe, expect, it } from "vitest";
import {
  LocationServiceError,
  createLocation,
  deleteLocation,
  findSubtreeIds,
  getLocationDetail,
  listLocationTree,
  moveLocation,
  updateLocation,
} from "./service";

async function reset() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "cable_event", "cable", "tray", "location", "cable_type", "color", "manufacturer", "user" CASCADE',
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
  it("returns the nested tree with active cable counts per subtree", async () => {
    const { plant, unit, site, sibling } = await seedTree();
    await prisma.cable.createMany({
      data: [
        { code: "SH-1", originId: unit.id },
        { code: "SH-2", destinationId: unit.id },
        { code: "SH-3", originId: unit.id, deletedAt: new Date() },
        // Regresión: enrollado en su propio origen contaba dos veces.
        { code: "SH-4", originId: site.id, currentLocationId: site.id },
        // Va de un sitio del subárbol a otro: un solo cable para los ancestros comunes.
        { code: "SH-5", originId: site.id, destinationId: unit.id },
        { code: "SH-6", originId: sibling.id, destinationId: site.id },
      ],
    });

    const [root] = await listLocationTree();
    const area = root?.children.find((node) => node.code === "A1");
    const unitNode = area?.children[0];

    expect(root?.children.map((node) => node.code)).toEqual(["A1", "A10"]);
    expect(unitNode?.children[0]).toMatchObject({ code: "S-XZ", cableCount: 3 });
    expect(unitNode).toMatchObject({ code: "R-X", cableCount: 5 });
    expect(area).toMatchObject({ cableCount: 5 });
    expect(root?.children.find((node) => node.code === "A10")).toMatchObject({ cableCount: 1 });
    expect(root).toMatchObject({ id: plant.id, cableCount: 5 });
  });

  it("selects a subtree without its siblings", async () => {
    const { area, unit, site, sibling } = await seedTree();

    const ids = await findSubtreeIds(area.id);

    expect(ids.sort()).toEqual([area.id, unit.id, site.id].sort());
    expect(ids).not.toContain(sibling.id);
    expect(await findSubtreeIds("missing")).toEqual([]);
  });
});

describe("moveLocation", () => {
  it("moves a unit with its sites to another area and rewrites every path", async () => {
    const { unit, site, sibling } = await seedTree();
    const cable = await prisma.cable.create({ data: { code: "SH-9", originId: site.id } });

    await moveLocation({ id: unit.id, parentId: sibling.id });

    expect(await prisma.location.findUniqueOrThrow({ where: { id: unit.id } })).toMatchObject({
      parentId: sibling.id,
      path: "/PL/A10/R-X",
    });
    expect(await pathOf(site.id)).toBe("/PL/A10/R-X/S-XZ");
    // Los cables siguen apuntando a la misma ubicación; ahora cuentan en el área nueva.
    expect((await prisma.cable.findUniqueOrThrow({ where: { id: cable.id } })).originId).toBe(
      site.id,
    );
    expect(await findSubtreeIds(sibling.id)).toEqual(expect.arrayContaining([unit.id, site.id]));
  });

  it("moves an area to another plant", async () => {
    const { area, site } = await seedTree();
    const otherPlant = await createLocation({
      name: "Sur",
      code: "SUR",
      type: "PLANT",
      parentId: null,
    });

    await moveLocation({ id: area.id, parentId: otherPlant.id });

    expect(await pathOf(area.id)).toBe("/SUR/A1");
    expect(await pathOf(site.id)).toBe("/SUR/A1/R-X/S-XZ");
  });

  it("only accepts a destination of the parent level", async () => {
    const { plant, unit, site } = await seedTree();

    await expect(moveLocation({ id: unit.id, parentId: plant.id })).rejects.toThrow(
      /solo se puede crear: área/,
    );
    await expect(moveLocation({ id: site.id, parentId: site.id })).rejects.toThrow(
      /dentro de sí misma/,
    );
    expect(await pathOf(site.id)).toBe("/PL/A1/R-X/S-XZ");
  });

  it("does not move plants and reports missing locations", async () => {
    const { plant, area } = await seedTree();
    const otherPlant = await createLocation({
      name: "Sur",
      code: "SUR",
      type: "PLANT",
      parentId: null,
    });

    await expect(moveLocation({ id: plant.id, parentId: otherPlant.id })).rejects.toThrow(
      "Las plantas no se pueden mover.",
    );
    await expect(moveLocation({ id: "missing", parentId: plant.id })).rejects.toThrow(
      "La ubicación no existe.",
    );
    await expect(moveLocation({ id: area.id, parentId: "missing" })).rejects.toThrow(
      "La ubicación de destino no existe.",
    );
  });

  // Revisión F0-F7 (B12): la ruta se leía antes de abrir la transacción; renombrar y mover
  // la misma rama a la vez dejaba a los descendientes con el prefijo antiguo.
  it("keeps every path coherent when a branch is renamed and moved at the same time", async () => {
    const { sibling, unit } = await seedTree();

    for (let round = 0; round < 5; round += 1) {
      await Promise.all([
        updateLocation({ id: unit.id, name: "Reactor X", code: `R-X${round}` }),
        moveLocation({
          id: unit.id,
          parentId:
            round % 2 === 0
              ? sibling.id
              : (await prisma.location.findUniqueOrThrow({ where: { code: "A1" } })).id,
        }),
      ]);
    }

    const locations = await prisma.location.findMany({ include: { parent: true } });
    for (const location of locations) {
      expect(location.path).toBe(`${location.parent?.path ?? ""}/${location.code}`);
    }
  });

  it("does nothing when the parent does not change", async () => {
    const { plant, area } = await seedTree();
    const before = await prisma.location.findUniqueOrThrow({ where: { id: area.id } });

    await moveLocation({ id: area.id, parentId: plant.id });

    expect(await prisma.location.findUniqueOrThrow({ where: { id: area.id } })).toEqual(before);
  });
});

describe("getLocationDetail", () => {
  beforeEach(reset);

  it("gives the path from the plant, what it contains and its cables and trays", async () => {
    const { plant, area, unit, site } = await seedTree();
    await prisma.tray.create({
      data: { code: "99UXA00L22036", kind: "LADDER", locationId: unit.id },
    });
    await prisma.cable.createMany({
      data: [
        { code: "SH-1", originId: site.id, destinationEquipment: "99BMA01" },
        { code: "SH-2", originEquipment: "99XKA10", destinationId: unit.id },
        { code: "SH-3", originId: plant.id, deletedAt: new Date() },
      ],
    });

    const detail = await getLocationDetail(unit.id);

    expect(detail).toMatchObject({
      name: "Reactor X",
      type: "UNIT",
      ancestors: [
        { id: plant.id, name: "Planta" },
        { id: area.id, name: "Área 1" },
      ],
      children: [{ id: site.id, name: "Sitio XZ" }],
      // SH-1 sale de un sitio que contiene; SH-2 llega aquí; SH-3 está de baja.
      cables: 2,
      trays: 1,
    });
    expect(detail!.someCables).toEqual([
      { id: expect.any(String), code: "SH-1", roles: ["origin"], otherEnd: "99BMA01" },
      { id: expect.any(String), code: "SH-2", roles: ["destination"], otherEnd: "99XKA10" },
    ]);
  });

  it("answers null for a location that does not exist", async () => {
    expect(await getLocationDetail("nope")).toBeNull();
  });
});
