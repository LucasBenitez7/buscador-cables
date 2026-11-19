import { prisma } from "@cables/db";
import { beforeEach, describe, expect, it } from "vitest";
import { quickSearch } from "./quick";

// Datos inventados.
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "cable_event", "cable", "tray", "location", "user" CASCADE',
  );
  const plant = await prisma.location.create({
    data: { code: "99", name: "Planta 99", type: "PLANT", path: "/99" },
  });
  await prisma.location.create({
    data: {
      code: "99UXA",
      name: "Edificio eléctrico",
      type: "UNIT",
      parentId: plant.id,
      path: "/99/99UXA",
    },
  });
  await prisma.tray.create({ data: { code: "99UXA00L22036", kind: "LADDER" } });
  await prisma.tray.create({ data: { code: "99UXA00L22051", kind: "LADDER" } });
  await prisma.cable.create({
    data: { code: "SH-50", originEquipment: "99BMA10", destinationEquipment: "99CXJ11" },
  });
  await prisma.cable.create({ data: { code: "SH-51", originEquipment: "99BMA10" } });
  await prisma.cable.create({ data: { code: "SH-52", deletedAt: new Date() } });
});

describe("quickSearch", () => {
  it("finds cables, trays, equipment and locations at once", async () => {
    const cables = await quickSearch("sh-5");
    expect(cables.cables.map((cable) => cable.code).sort()).toEqual(["SH-50", "SH-51"]);
    expect(cables.cablesTotal).toBe(2);
    expect(cables.exact).toBeNull();

    const trays = await quickSearch("l220");
    expect(trays.trays.map((tray) => tray.code)).toEqual(["99UXA00L22036", "99UXA00L22051"]);
    expect(trays.traysTotal).toBe(2);

    const equipment = await quickSearch("bma");
    expect(equipment.equipment).toEqual([{ equipment: "99BMA10", cables: 2 }]);

    const locations = await quickSearch("edificio");
    expect(locations.locations).toMatchObject([{ code: "99UXA", name: "Edificio eléctrico" }]);
  });

  it("points straight to the record when the text is exactly one code", async () => {
    const cable = await prisma.cable.findUniqueOrThrow({ where: { code: "SH-50" } });

    expect((await quickSearch("sh 50")).exact).toBe(`/cables/${cable.id}`);
    expect((await quickSearch("99uxa00l22036")).exact).toBe("/trays/99UXA00L22036");
    expect((await quickSearch("99bma10")).exact).toBe("/equipment/99BMA10");
  });

  it("does not search with less than two letters, and never shows deleted cables", async () => {
    expect((await quickSearch(" s ")).cables).toEqual([]);
    expect((await quickSearch("sh-52")).cables.map((cable) => cable.code)).not.toContain("SH-52");
  });
});
