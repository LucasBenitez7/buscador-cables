import { prisma } from "@cables/db";
import { beforeEach, describe, expect, it } from "vitest";
import { getMetersDeviation, getMetersProgress, getReelStatus, listReels } from "./service";

let area: string;
let otherArea: string;

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "cable_event", "cable", "tray", "location" CASCADE');
  const plant = await prisma.location.create({
    data: { code: "99", name: "Planta 99", type: "PLANT", path: "/99" },
  });
  const group = await prisma.location.create({
    data: { code: "99UX", name: "Área 99UX", type: "AREA", parentId: plant.id, path: "/99/99UX" },
  });
  area = group.id;
  const other = await prisma.location.create({
    data: { code: "99UY", name: "Área 99UY", type: "AREA", parentId: plant.id, path: "/99/99UY" },
  });
  otherArea = other.id;
  const tray = await prisma.tray.create({
    data: { code: "99UYA00L22001", kind: "LADDER", locationId: other.id },
  });
  const room = await prisma.location.create({
    data: {
      code: "99UXA16RA001",
      name: "Sala inventada",
      type: "SITE",
      parentId: group.id,
      path: "/99/99UX/99UXA16RA001",
    },
  });
  await prisma.cable.createMany({
    data: [
      // Tendido con sus metros reales: cuenta los reales (110 de 100 previstos, +10 %).
      {
        code: "ZZ-1",
        level: "L1",
        installationStatus: "LAID",
        lengthM: 100,
        actualLengthM: 110,
        reel: "B-1",
        reelStatus: "En obra",
        laidOn: new Date("2026-11-10"),
        originId: room.id,
      },
      // Tendido sin metros reales: cuenta los previstos; no entra en la comparación.
      { code: "ZZ-2", level: "L1", installationStatus: "LAID", lengthM: 50, reel: "B-1" },
      // Tendido con 60 de 200 previstos (−70 %): el que más se desvía.
      {
        code: "ZZ-3",
        level: "L2",
        installationStatus: "LAID",
        lengthM: 200,
        actualLengthM: 60,
        reel: "B-2",
      },
      // Sin ubicación ni recorrido: en «Sin área».
      {
        code: "ZZ-8",
        level: "L2",
        installationStatus: "LAID",
        lengthM: 10,
        actualLengthM: 10,
      },
      // Sin tender: suma a lo previsto, no a lo tendido.
      { code: "ZZ-4", level: "L2", installationStatus: "NOT_LAID", lengthM: 300 },
      // Sin longitud en el listado.
      { code: "ZZ-5", installationStatus: "UNVERIFIED" },
      // Tendido con metros reales pero sin longitud en el listado: no suma a lo tendido, porque
      // tampoco suma a lo previsto.
      { code: "ZZ-9", installationStatus: "LAID", actualLengthM: 40 },
      // Retirado y dado de baja: fuera de todo.
      { code: "ZZ-6", level: "L1", installationStatus: "RETIRED", lengthM: 999 },
      {
        code: "ZZ-7",
        level: "L1",
        installationStatus: "LAID",
        lengthM: 999,
        actualLengthM: 1,
        reel: "B-1",
        deletedAt: new Date(),
      },
    ],
  });
  // ZZ-3 no trae origen (como los listados eléctricos): su área es la de su primera bandeja.
  const zz3 = await prisma.cable.findUniqueOrThrow({ where: { code: "ZZ-3" } });
  await prisma.cableRouteStep.create({
    data: { cableId: zz3.id, position: 1, label: tray.code, trayId: tray.id },
  });
});

describe("getMetersProgress", () => {
  it("adds the planned metres and the laid ones (real, or planned without them), by level", async () => {
    const progress = await getMetersProgress();

    expect(progress).toMatchObject({ planned: 660, laid: 230, cables: 7, withoutLength: 2 });
    expect(progress.byLevel).toEqual([
      {
        key: "L1",
        label: expect.any(String),
        href: "/cables?level=L1",
        cables: 2,
        planned: 150,
        laid: 160,
      },
      {
        key: "L2",
        label: expect.any(String),
        href: "/cables?level=L2",
        cables: 3,
        planned: 510,
        laid: 70,
      },
      { key: "none", label: "Sin nivel", href: "/cables", cables: 2, planned: 0, laid: 0 },
    ]);
  });
});

describe("getMetersDeviation", () => {
  it("compares only the cables with both lengths, by level, by area and the worst first", async () => {
    const deviation = await getMetersDeviation();

    expect(deviation).toMatchObject({ compared: 3, planned: 310, actual: 180 });
    expect(deviation.byLevel.map((row) => [row.key, row.planned, row.actual])).toEqual([
      ["L1", 100, 110],
      ["L2", 210, 70],
    ]);
    expect(deviation.byArea).toEqual([
      {
        key: area,
        label: "Área 99UX",
        href: null,
        cables: 1,
        planned: 100,
        actual: 110,
      },
      {
        key: otherArea,
        label: "Área 99UY",
        href: null,
        cables: 1,
        planned: 200,
        actual: 60,
      },
      { key: "none", label: "Sin área", href: null, cables: 1, planned: 10, actual: 10 },
    ]);
    expect(deviation.top.map((cable) => [cable.code, Math.round(cable.percent)])).toEqual([
      ["ZZ-3", -70],
      ["ZZ-1", 10],
      ["ZZ-8", 0],
    ]);
  });
});

describe("listReels", () => {
  it("lists each reel with its cables, the real metres taken and those still without them", async () => {
    expect(await listReels()).toEqual([
      {
        reel: "B-1",
        status: "En obra",
        cables: 2,
        metres: 110,
        withoutMetres: 1,
        lastLaidOn: new Date("2026-11-10"),
      },
      { reel: "B-2", status: null, cables: 1, metres: 60, withoutMetres: 0, lastLaidOn: null },
    ]);
    expect((await listReels("b-2")).map((row) => row.reel)).toEqual(["B-2"]);
  });

  it("sorts the reels by their number, not as text", async () => {
    await prisma.cable.createMany({
      data: ["1000", "99", "100", "B-10"].map((reel, index) => ({ code: `ZZ-R${index}`, reel })),
    });

    expect((await listReels()).map((row) => row.reel)).toEqual([
      "99",
      "100",
      "1000",
      "B-1",
      "B-2",
      "B-10",
    ]);
  });

  it("says the state of one reel, or nothing when the Excel brings none", async () => {
    expect(await getReelStatus("B-1")).toBe("En obra");
    expect(await getReelStatus("B-2")).toBeNull();
    expect(await getReelStatus("B-9")).toBeNull();
  });
});

describe("sections with cables in parallel", () => {
  it("count the metres of each of their cables, as the Excel does", async () => {
    // Un tramo de un circuito con 3 cables en paralelo de 40 m: 120 m previstos, 126 m reales.
    await prisma.cable.create({
      data: {
        code: "ZZ-10.1",
        level: "L4",
        circuit: "1 de 2",
        cablesPerCircuit: 3,
        installationStatus: "LAID",
        lengthM: 40,
        actualLengthM: 42,
        reel: "B-3",
      },
    });

    const progress = await getMetersProgress();
    expect(progress.byLevel.find((row) => row.key === "L4")).toMatchObject({
      cables: 1,
      planned: 120,
      laid: 126,
    });
    const deviation = await getMetersDeviation();
    expect(deviation.byLevel.find((row) => row.key === "L4")).toMatchObject({
      planned: 120,
      actual: 126,
    });
    // Each of its cables deviates the same: +5 %.
    expect(Math.round(deviation.top.find((cable) => cable.code === "ZZ-10.1")!.percent)).toBe(5);
    expect((await listReels("B-3"))[0]).toMatchObject({ cables: 1, metres: 126 });
  });
});
