import { prisma } from "@cables/db";
import { beforeEach, describe, expect, it } from "vitest";
import { getEquipment, searchEquipment } from "./service";

const wire = (position: number, originPoint: string) => ({
  position,
  wire: String(position),
  originBlock: "X51",
  originPoint,
  destinationBlock: "TB1",
  destinationPoint: originPoint,
  pdfOriginBlock: "X51",
  pdfOriginPoint: originPoint,
  pdfDestinationBlock: "TB1",
  pdfDestinationPoint: originPoint,
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "cable_event", "cable", "user", "equipment_drawing", "drawing_sheet", "location" CASCADE',
  );
  await prisma.cable.create({
    data: {
      code: "99A",
      originEquipment: "99BMA10",
      destinationEquipment: "99CXJ11",
      connectionStatus: "ORIGIN_ONLY",
      testStatus: "TESTED_OK",
      wires: { create: [wire(1, "11"), wire(2, "12")] },
    },
  });
  await prisma.cable.create({
    data: {
      code: "99B",
      originEquipment: "99CXJ11",
      destinationEquipment: "99BMA10",
      wires: { create: [wire(1, "3")] },
    },
  });
  await prisma.cable.create({
    data: { code: "99C", originEquipment: "99BMA10", deletedAt: new Date() },
  });
  await prisma.cable.create({ data: { code: "99D", originEquipment: "99B%_X" } });
});

describe("searchEquipment", () => {
  it("finds equipment by part of its tag, most cables first, without deleted cables", async () => {
    expect(await searchEquipment("bma")).toEqual([{ equipment: "99BMA10", cables: 2 }]);
    expect(await searchEquipment("")).toEqual([
      { equipment: "99BMA10", cables: 2 },
      { equipment: "99CXJ11", cables: 2 },
      { equipment: "99B%_X", cables: 1 },
    ]);
  });

  it("takes '%' and '_' literally", async () => {
    expect(await searchEquipment("%_")).toEqual([{ equipment: "99B%_X", cables: 1 }]);
  });

  it("sorts by code A-Z or Z-A on request", async () => {
    // El orden exacto de "%" y "_" depende de la collation de la base: se miran los otros dos.
    const codes = async (sort: "name" | "name-desc") =>
      (await searchEquipment("", sort))
        .map((match) => match.equipment)
        .filter((equipment) => equipment !== "99B%_X");

    expect(await codes("name")).toEqual(["99BMA10", "99CXJ11"]);
    expect(await codes("name-desc")).toEqual(["99CXJ11", "99BMA10"]);
  });

  it("sorts the fewest cables first on request, then by code", async () => {
    const shown = await searchEquipment("", "cables-asc");

    expect(shown.map((match) => match.cables)).toEqual([1, 2, 2]);
    expect(shown.slice(1).map((match) => match.equipment)).toEqual(["99BMA10", "99CXJ11"]);
  });
});

describe("getEquipment", () => {
  it("lists the ends landing in the equipment, by strip, with their state there", async () => {
    const equipment = await getEquipment("99bma10");

    expect(equipment).toMatchObject({
      equipment: "99BMA10",
      totals: { ends: 2, connected: 1, tested: 1 },
    });
    expect(
      equipment?.groups.flatMap((group) =>
        group.ends.map((end) => [group.block, end.code, end.end, end.connected]),
      ),
    ).toEqual([
      ["TB1", "99B", "destination", false],
      ["X51", "99A", "origin", true],
    ]);
  });

  it("gives null for an equipment without cables, or a tag that is too long", async () => {
    expect(await getEquipment("99NADA")).toBeNull();
    expect(await getEquipment("X".repeat(121))).toBeNull();
    expect(await getEquipment("  ")).toBeNull();
  });
});

describe("getEquipment: where it is (fase 19)", () => {
  it("gives the rooms its cables end in, the most used first", async () => {
    const plant = await prisma.location.create({
      data: { code: "99", name: "Planta 99", type: "PLANT", path: "/99" },
    });
    const room = await prisma.location.create({
      data: {
        code: "99UXA16RA001",
        name: "99UXA16RA001",
        type: "AREA",
        parentId: plant.id,
        path: "/99/99UXA16RA001",
      },
    });
    await prisma.cable.updateMany({ where: { code: "99A" }, data: { originId: room.id } });
    await prisma.cable.updateMany({
      where: { code: "99B" },
      data: { destinationId: room.id, originId: plant.id },
    });

    const equipment = await getEquipment("99bma10");

    expect(equipment?.locations).toEqual([
      { id: room.id, name: "Planta 99 › 99UXA16RA001", cables: 2 },
    ]);
    // El otro extremo de 99B está en la planta, pero ese es el de 99CXJ11.
    expect((await getEquipment("99CXJ11"))?.locations).toEqual([
      { id: plant.id, name: "Planta 99", cables: 1 },
    ]);
  });

  it("gives the sheets where it is drawn, without an image until it is rendered", async () => {
    await prisma.equipmentDrawing.create({
      data: {
        equipment: "99BMA10",
        drawing: "EJ-ICO-DRW-0001",
        sheet: "52",
        drawnAs: "99BMA10",
        marks: [{ x: 0.1, y: 0.2, w: 0.01, h: 0.005, kind: "label" }],
      },
    });

    expect((await getEquipment("99BMA10"))?.drawings).toEqual([
      {
        drawing: "EJ-ICO-DRW-0001",
        sheet: "52",
        title: null,
        drawnAs: "99BMA10",
        marks: [{ x: 0.1, y: 0.2, w: 0.01, h: 0.005, kind: "label" }],
        image: null,
      },
    ]);
    expect((await getEquipment("99CXJ11"))?.drawings).toEqual([]);
  });
});
