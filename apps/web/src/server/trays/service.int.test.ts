import { prisma } from "@cables/db";
import { parseCableSearch } from "@cables/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { searchCables } from "@/server/cables/search";
import { getTrayDetail, searchTrays } from "./service";

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "cable_event", "cable", "tray", "location", "cable_type", "color", "manufacturer", "user" CASCADE',
  );
  const plant = await prisma.location.create({
    data: { code: "99", name: "Planta 99", type: "PLANT", path: "/99" },
  });
  const group = await prisma.location.create({
    data: { code: "99UX", name: "99UX", type: "AREA", parentId: plant.id, path: "/99/99UX" },
  });
  const building = await prisma.location.create({
    data: {
      code: "99UXA",
      name: "Edificio eléctrico",
      type: "UNIT",
      parentId: group.id,
      path: "/99/99UX/99UXA",
    },
  });
  const [main, riser, conduit] = await Promise.all([
    prisma.tray.create({
      data: {
        code: "99UXA00L22036",
        kind: "LADDER",
        voltageLevel: 2,
        elevationLevel: 2,
        areaCode: "99UXA",
        locationId: building.id,
        widthMm: 600,
        flangeHeightMm: 100,
        bendRadiusMm: 300,
        drawings: {
          create: [
            { drawing: "EJ-ELE-DRW-0024", sheet: "03", title: "PRIMERA PLANTA", sourcePage: 94 },
            { drawing: "EJ-ELE-DRW-0024", sheet: "02", title: null, sourcePage: 93 },
          ],
        },
      },
    }),
    prisma.tray.create({ data: { code: "99UXA00L22051", kind: "LADDER", voltageLevel: 2 } }),
    prisma.tray.create({ data: { code: "99UXA00C20101", kind: "CONDUIT", diameterMm: 25 } }),
  ]);

  const cable = (code: string, data: Record<string, unknown> = {}) =>
    prisma.cable.create({ data: { code, installationStatus: "UNVERIFIED", ...data } });
  const route = (cableId: string, ids: string[]) =>
    prisma.cableRouteStep.createMany({
      data: ids.map((trayId, index) => ({ cableId, position: index + 1, label: "x", trayId })),
    });

  const waiting = await cable("99XAT10W2010", {
    level: "L2",
    installationStatus: "PARTIALLY_LAID",
    connectionStatus: "ORIGIN_ONLY",
    looseEnd: "DESTINATION",
    looseEndTrayId: main.id,
    originEquipment: "99BMA",
    destinationEquipment: "99XAT10AP001",
  });
  const through = await cable("99XAT10W2002", { level: "L2", originEquipment: "99BMB" });
  const instrument = await cable("99XAB10T1-W8001", { level: "L1", altCode: "99 CBLM-0112" });
  const deleted = await cable("99XAT10W2003", { level: "L2", deletedAt: new Date() });
  await route(waiting.id, [main.id, riser.id]);
  // The same tray twice in one route: the cable counts once in the tray record.
  await route(through.id, [main.id, conduit.id, main.id]);
  await route(instrument.id, [conduit.id]);
  await route(deleted.id, [main.id]);
});

describe("searchTrays", () => {
  it("lists trays by code with their building and cable counts", async () => {
    const result = await searchTrays({ q: "99UXA00L2" });

    expect(result).toMatchObject({ total: 2, page: 1, pageCount: 1 });
    expect(result.items).toEqual([
      {
        code: "99UXA00L22036",
        kind: "LADDER",
        voltageLevel: 2,
        elevationLevel: 2,
        building: "99UXA · Edificio eléctrico",
        buildingId: expect.any(String),
        size: { widthMm: 600, flangeHeightMm: 100, bendRadiusMm: 300, diameterMm: null },
        // Active cables, each once: one names the tray twice and the deleted one is out.
        cables: 2,
        waiting: 1,
      },
      expect.objectContaining({ code: "99UXA00L22051", cables: 1, waiting: 0, building: null }),
    ]);
  });

  // Revisión F0-F7 (B8): el listado contaba tramos y la ficha, cables.
  it("counts the same cables as the tray record", async () => {
    const [listed] = (await searchTrays({ q: "99UXA00L22036" })).items;
    const detail = await getTrayDetail("99UXA00L22036");

    expect(listed?.cables).toBe(detail?.cables);
  });

  // Revisión F0-F7 (M6): Prisma no escapa los comodines de LIKE y "_" es parte de los códigos.
  it("matches _ and % literally", async () => {
    await prisma.tray.create({ data: { code: "99UM_00L22037", kind: "LADDER" } });

    expect((await searchTrays({ q: "UM_" })).items.map((tray) => tray.code)).toEqual([
      "99UM_00L22037",
    ]);
    expect((await searchTrays({ q: "_" })).total).toBe(1);
    expect((await searchTrays({ q: "%" })).total).toBe(0);
    expect((await searchTrays({ q: "UX_" })).total).toBe(0);
  });

  it("pages the list and clamps a page past the end", async () => {
    const result = await searchTrays({ page: 9 }, 2);

    expect(result).toMatchObject({ total: 3, page: 2, pageCount: 2 });
    expect(result.items.map((tray) => tray.code)).toEqual(["99UXA00L22051"]);
  });
});

describe("getTrayDetail", () => {
  it("returns the sheets, the cables waiting in it and every cable going through", async () => {
    const tray = await getTrayDetail("99UXA00L22036");

    expect(tray).toMatchObject({
      code: "99UXA00L22036",
      cables: 2,
      waiting: 1,
      drawings: [
        { drawing: "EJ-ELE-DRW-0024", sheet: "02", title: null, sourcePage: 93 },
        { drawing: "EJ-ELE-DRW-0024", sheet: "03", title: "PRIMERA PLANTA", sourcePage: 94 },
      ],
    });
    expect(tray?.waitingCables).toEqual([
      expect.objectContaining({
        code: "99XAT10W2010",
        looseEndHere: "DESTINATION",
        originEquipment: "99BMA",
        installationStatus: "PARTIALLY_LAID",
      }),
    ]);
    // Natural order, each cable once, the deleted one left out.
    expect(tray?.routeCables.map((cable) => [cable.code, cable.looseEndHere])).toEqual([
      ["99XAT10W2002", null],
      ["99XAT10W2010", "DESTINATION"],
    ]);
  });

  it("returns null for an unknown tray", async () => {
    expect(await getTrayDetail("99UXZ00L22036")).toBeNull();
  });
});

describe("searchCables: project data filters", () => {
  const codes = async (params: Record<string, string>) =>
    (await searchCables(parseCableSearch(params))).items.map((cable) => cable.code).sort();

  it("finds cables by the equipment of either end and by the marking number", async () => {
    expect(await codes({ q: "99bma" })).toEqual(["99XAT10W2010"]);
    expect(await codes({ q: "99XAT10AP" })).toEqual(["99XAT10W2010"]);
    expect(await codes({ q: "CBLM-0112" })).toEqual(["99XAB10T1-W8001"]);
  });

  it("filters by level, by tray and by the loose ends waiting in it", async () => {
    expect(await codes({ level: "L1" })).toEqual(["99XAB10T1-W8001"]);
    expect(await codes({ tray: "99uxa00c20101" })).toEqual(["99XAB10T1-W8001", "99XAT10W2002"]);
    expect(await codes({ tray: "99UXA00L22036", loose: "1" })).toEqual(["99XAT10W2010"]);
    expect(await codes({ tray: "99UXA00L22051", loose: "1" })).toEqual([]);
    expect(await codes({ loose: "1" })).toEqual(["99XAT10W2010"]);
  });

  it("returns the level and the equipment of each result", async () => {
    const [cable] = (await searchCables(parseCableSearch({ q: "99BMA" }))).items;

    expect(cable).toMatchObject({
      level: "L2",
      originEquipment: "99BMA",
      destinationEquipment: "99XAT10AP001",
      state: { looseEnd: "DESTINATION", looseEndTray: "99UXA00L22036" },
    });
  });
});
