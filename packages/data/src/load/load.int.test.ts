import { randomUUID } from "node:crypto";
import { createPrismaClient } from "@cables/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { ProjectCable, ProjectTray } from "../extract/schema";
import { loadProjectData } from "./load";

const db = createPrismaClient(process.env.DATABASE_URL!);
let userId: string;

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE "cable_event", "cable", "tray", "location", "cable_type", "color", "manufacturer", "user" CASCADE',
  );
  ({ id: userId } = await db.user.create({
    data: { id: randomUUID(), name: "Carga", email: "carga@cables.test", role: "ADMIN" },
  }));
});

afterAll(() => db.$disconnect());

const end = (fields: Partial<ProjectCable["origin"]> = {}): ProjectCable["origin"] => ({
  equipment: null,
  cubicle: null,
  gland: null,
  functionKks: null,
  installationKks: null,
  room: null,
  ...fields,
});

function instrumentCable(overrides: Partial<ProjectCable> = {}): ProjectCable {
  return {
    code: "99XAB10T1-W8001",
    level: "L1",
    altCode: null,
    revision: "2",
    description: null,
    typeCode: null,
    typeName: "JE-Y(St)Y BD Si FR 4 x 2 x 0,8mm",
    conductors: 8,
    crossSectionMm2: 0.5,
    voltageRating: null,
    lengthM: 137,
    lengthPending: false,
    circuit: null,
    cablesPerCircuit: null,
    composition: null,
    diagram: "EJ-ICO-DIA-0100_010",
    notes: "Supplied by the vendor",
    sourceDocument: "EJ-ICO-LST-0100",
    sourceFile: "instrumentacion.pdf",
    sourcePage: 8,
    origin: end({ equipment: "99XAB10CT001", gland: "M-20ARM", room: "99UYC14RA001" }),
    destination: end({ equipment: "99CXJ11", gland: "M-20", room: "99UXB23RA052" }),
    route: [
      { label: "99UYC01L10002", trayCode: "99UYC01L10002", section: "FIELD" },
      { label: "(NOTE 1)", trayCode: null, section: "FIELD" },
      { label: "99UXB01L10030", trayCode: "99UXB01L10030", section: "ROOM" },
    ],
    ...overrides,
  };
}

function powerCable(overrides: Partial<ProjectCable> = {}): ProjectCable {
  return {
    ...instrumentCable(),
    code: "99XAT10W2005",
    level: "L2",
    description: "MOTOR FEEDER 99XAT10AP001",
    typeCode: "Q0825",
    typeName: "0,6/1 KV 8X2.5 MM2 CU",
    conductors: 8,
    crossSectionMm2: 2.5,
    voltageRating: "0,6/1 kV",
    lengthM: 142,
    diagram: null,
    notes: null,
    sourceDocument: "EJ-ELE-LST-0011",
    sourceFile: "electrico.pdf",
    // The power lists give equipment and KKS, but no room.
    origin: end({ equipment: "99BMA", functionKks: "=99BMA00GS101", installationKks: "+99BMA01" }),
    destination: end({ equipment: "99XAT10AP001" }),
    route: [{ label: "99UXA00L22036", trayCode: "99UXA00L22036", section: null }],
    ...overrides,
  };
}

function tray(code: string, overrides: Partial<ProjectTray> = {}): ProjectTray {
  return {
    code,
    kind: "LADDER",
    voltageLevel: Number(code[8]),
    elevationLevel: Number(code[9]),
    areaCode: code.slice(0, 5),
    widthMm: null,
    flangeHeightMm: null,
    bendRadiusMm: null,
    diameterMm: null,
    drawings: [{ drawing: "EJ-ELE-DRW-0024", sheet: "02", title: "FIRST FLOOR", sourcePage: 93 }],
    ...overrides,
  };
}

const trays = [
  tray("99UYC01L10002"),
  tray("99UXB01L10030"),
  tray("99UXA00L22036", { widthMm: 600, flangeHeightMm: 100, bendRadiusMm: 300 }),
];

const load = (cables: ProjectCable[], trayList: ProjectTray[] = trays) =>
  loadProjectData(
    db,
    { cables, trays: trayList },
    { userId, now: new Date("2026-11-13T10:00:00Z") },
  );

describe("loadProjectData: first load", () => {
  it("builds the location tree from the KKS rooms and buildings", async () => {
    const summary = await load([instrumentCable(), powerCable()]);

    const locations = await db.location.findMany({ orderBy: { path: "asc" } });
    expect(locations.map((location) => [location.path, location.type, location.name])).toEqual([
      ["/99", "PLANT", "Planta 99"],
      ["/99/99UX", "AREA", "99UX"],
      ["/99/99UX/99UXA", "UNIT", "99UXA"],
      ["/99/99UX/99UXB", "UNIT", "99UXB"],
      ["/99/99UX/99UXB/99UXB23RA052", "SITE", "99UXB23RA052"],
      ["/99/99UY", "AREA", "99UY"],
      ["/99/99UY/99UYC", "UNIT", "99UYC"],
      ["/99/99UY/99UYC/99UYC14RA001", "SITE", "99UYC14RA001"],
    ]);
    expect(summary.locations.created).toBe(8);
  });

  it("creates the cables unverified, with their ends, route and CREATED event", async () => {
    const summary = await load([instrumentCable(), powerCable()]);

    expect(summary.cables).toEqual({ created: 2, updated: 0, unchanged: 0, skipped: 0 });
    const cable = await db.cable.findUniqueOrThrow({
      where: { code: "99XAB10T1-W8001" },
      include: {
        origin: true,
        destination: true,
        type: true,
        routeSteps: { orderBy: { position: "asc" }, include: { tray: true } },
        events: true,
      },
    });
    expect(cable).toMatchObject({
      level: "L1",
      installationStatus: "UNVERIFIED",
      connectionStatus: "DISCONNECTED",
      currentLocationId: null,
      originEquipment: "99XAB10CT001",
      originGland: "M-20ARM",
      originRoom: "99UYC14RA001",
      origin: { code: "99UYC14RA001" },
      destination: { code: "99UXB23RA052" },
      type: { name: "JE-Y(St)Y BD Si FR 4 x 2 x 0,8mm", code: null },
      conductors: 8,
      notes: "Supplied by the vendor",
      sourceDocument: "EJ-ICO-LST-0100",
      sourcePage: 8,
      lastAction: "CREATED",
      lastActionById: userId,
    });
    expect(cable.lengthM?.toNumber()).toBe(137);
    expect(cable.crossSectionMm2?.toNumber()).toBe(0.5);
    expect(
      cable.routeSteps.map((step) => [
        step.position,
        step.label,
        step.tray?.code ?? null,
        step.section,
      ]),
    ).toEqual([
      [1, "99UYC01L10002", "99UYC01L10002", "FIELD"],
      [2, "(NOTE 1)", null, "FIELD"],
      [3, "99UXB01L10030", "99UXB01L10030", "ROOM"],
    ]);
    expect(cable.events).toEqual([
      expect.objectContaining({
        action: "CREATED",
        userId,
        changes: { installationStatus: { from: null, to: "UNVERIFIED" } },
        notes: "Cargado de los listados del proyecto (EJ-ICO-LST-0100, pág. 8).",
      }),
    ]);

    // Without a room, the power cable keeps its equipment and no location.
    expect(await db.cable.findUniqueOrThrow({ where: { code: "99XAT10W2005" } })).toMatchObject({
      originId: null,
      originEquipment: "99BMA",
      originFunctionKks: "=99BMA00GS101",
      destinationEquipment: "99XAT10AP001",
    });
  });

  it("creates the trays with their sheets and the cable types with their codes", async () => {
    const summary = await load([instrumentCable(), powerCable()]);

    expect(summary.trays).toEqual({ created: 3, updated: 0, unchanged: 0 });
    expect(summary.cableTypes.created).toBe(2);
    expect(
      await db.tray.findUniqueOrThrow({
        where: { code: "99UXA00L22036" },
        include: { location: true, drawings: true },
      }),
    ).toMatchObject({
      kind: "LADDER",
      voltageLevel: 2,
      widthMm: 600,
      location: { code: "99UXA" },
      drawings: [{ drawing: "EJ-ELE-DRW-0024", sheet: "02", title: "FIRST FLOOR", sourcePage: 93 }],
    });
    expect(await db.cableType.findUniqueOrThrow({ where: { code: "Q0825" } })).toMatchObject({
      name: "0,6/1 KV 8X2.5 MM2 CU",
    });
  });
});

describe("loadProjectData: loading again", () => {
  it("changes nothing when the lists did not change", async () => {
    await load([instrumentCable(), powerCable()]);

    const summary = await load([instrumentCable(), powerCable()]);

    expect(summary).toMatchObject({
      locations: { created: 0 },
      cableTypes: { created: 0 },
      trays: { created: 0, updated: 0, unchanged: 3 },
      cables: { created: 0, updated: 0, unchanged: 2, skipped: 0 },
      missingFromLists: [],
    });
    expect(await db.cableEvent.count()).toBe(2);
    expect(await db.cable.count()).toBe(2);
  });

  it("updates the engineering data and keeps what the field recorded", async () => {
    await load([instrumentCable(), powerCable()]);
    const cable = await db.cable.findUniqueOrThrow({ where: { code: "99XAT10W2005" } });
    // A technician laid and connected it and wrote a note.
    await db.cable.update({
      where: { id: cable.id },
      data: {
        installationStatus: "LAID",
        connectionStatus: "ORIGIN_ONLY",
        notes: "Etiquetado en campo",
        lastAction: "CONNECTED",
        version: 3,
      },
    });

    const summary = await load([
      instrumentCable(),
      powerCable({
        revision: "3_RX00",
        lengthM: 150.5,
        route: [
          { label: "99UXA00L22036", trayCode: "99UXA00L22036", section: null },
          { label: "TRAM. VERTICAL", trayCode: null, section: null },
        ],
      }),
    ]);

    expect(summary.cables).toMatchObject({ updated: 1, unchanged: 1 });
    const after = await db.cable.findUniqueOrThrow({
      where: { id: cable.id },
      include: { routeSteps: { orderBy: { position: "asc" } } },
    });
    expect(after).toMatchObject({
      installationStatus: "LAID",
      connectionStatus: "ORIGIN_ONLY",
      notes: "Etiquetado en campo",
      lastAction: "CONNECTED",
      revision: "3_RX00",
      version: 4,
    });
    expect(after.lengthM?.toNumber()).toBe(150.5);
    expect(after.routeSteps.map((step) => step.label)).toEqual(["99UXA00L22036", "TRAM. VERTICAL"]);
    const updated = await db.cableEvent.findFirstOrThrow({
      where: { cableId: cable.id, action: "UPDATED" },
    });
    expect(updated).toMatchObject({
      userId,
      changes: {
        revision: { from: "2", to: "3_RX00" },
        lengthM: { from: 142, to: 150.5 },
        route: { from: "1 tramos", to: "2 tramos" },
      },
      notes: "Actualizado desde los listados del proyecto (revisión 3_RX00).",
    });
  });

  it("updates trays whose size or sheets changed", async () => {
    await load([powerCable()]);

    const summary = await load(
      [powerCable()],
      [
        trays[0]!,
        trays[1]!,
        tray("99UXA00L22036", {
          widthMm: 800,
          drawings: [{ drawing: "EJ-ELE-DRW-0024", sheet: "03", title: null, sourcePage: 94 }],
        }),
      ],
    );

    expect(summary.trays).toEqual({ created: 0, updated: 1, unchanged: 2 });
    expect(
      await db.tray.findUniqueOrThrow({
        where: { code: "99UXA00L22036" },
        include: { drawings: true },
      }),
    ).toMatchObject({ widthMm: 800, drawings: [{ sheet: "03", sourcePage: 94 }] });
  });

  it("leaves deleted cables alone and reports cables no longer in the lists", async () => {
    await load([instrumentCable(), powerCable()]);
    await db.cable.update({ where: { code: "99XAT10W2005" }, data: { deletedAt: new Date() } });

    const summary = await load([powerCable({ lengthM: 1 })]);

    expect(summary.cables).toMatchObject({ skipped: 1, updated: 0 });
    expect(summary.issues).toContain("99XAT10W2005 está dado de baja en la app: no se actualiza.");
    expect(summary.missingFromLists).toEqual(["99XAB10T1-W8001"]);
    expect(
      (await db.cable.findUniqueOrThrow({ where: { code: "99XAT10W2005" } })).lengthM?.toNumber(),
    ).toBe(142);
  });
});

describe("loadProjectData: conflicts", () => {
  it("does not use a location with the same code somewhere else in the tree", async () => {
    const plant = await db.location.create({
      data: { code: "OTRA", name: "Otra", type: "PLANT", path: "/OTRA" },
    });
    const area = await db.location.create({
      data: {
        code: "OTRA-A",
        name: "Área",
        type: "AREA",
        parentId: plant.id,
        path: "/OTRA/OTRA-A",
      },
    });
    await db.location.create({
      data: {
        code: "99UYC",
        name: "Movido",
        type: "UNIT",
        parentId: area.id,
        path: "/OTRA/OTRA-A/99UYC",
      },
    });

    const summary = await load([instrumentCable()]);

    expect(summary.issues).toContain(
      "La ubicación 99UYC ya existe en otro sitio del árbol: no se usa para los cables.",
    );
    const cable = await db.cable.findUniqueOrThrow({ where: { code: "99XAB10T1-W8001" } });
    expect(cable.originId).toBeNull();
    expect(cable.originRoom).toBe("99UYC14RA001");
  });

  it("keeps a type code for the type that already has it", async () => {
    await db.cableType.create({ data: { name: "Otro tipo", code: "Q0825" } });
    await db.cableType.create({ data: { name: "0,6/1 KV 8X2.5 MM2 CU" } });

    const summary = await load([powerCable()]);

    expect(summary.issues).toContain(
      'El código de tipo Q0825 ya lo tiene otro tipo: "0,6/1 KV 8X2.5 MM2 CU" queda sin código.',
    );
    expect(summary.cableTypes.created).toBe(0);
  });

  it("refuses files that do not have the expected shape", async () => {
    await expect(
      loadProjectData(db, { cables: [{ code: "x" }], trays: [] }, { userId }),
    ).rejects.toThrow();
    expect(await db.cable.count()).toBe(0);
  });
});
