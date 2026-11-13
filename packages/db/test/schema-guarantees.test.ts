import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient } from "../src/client";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL_TEST debe estar definida para los tests de integración.");
}

const prisma = createPrismaClient(url);

async function reset() {
  // TRUNCATE no dispara los triggers por fila, así que también limpia cable_event.
  await prisma.$executeRawUnsafe(
    'TRUNCATE "cable_event", "cable", "tray", "location", "cable_type", "color", "manufacturer", "user" CASCADE',
  );
}

async function seedCableWithEvent() {
  const user = await prisma.user.create({
    data: { id: randomUUID(), name: "Ana", email: `${randomUUID()}@cables.test` },
  });
  const plant = await prisma.location.create({
    data: { name: "Planta", code: "PL", type: "PLANT", path: "/PL" },
  });
  const cable = await prisma.cable.create({ data: { code: "SH-50", originId: plant.id } });
  const event = await prisma.cableEvent.create({
    data: { cableId: cable.id, userId: user.id, action: "CREATED", changes: {} },
  });
  return { user, plant, cable, event };
}

beforeEach(reset);

afterAll(async () => {
  await reset();
  await prisma.$disconnect();
});

describe("cable_event immutability", () => {
  it("rejects updates", async () => {
    const { event } = await seedCableWithEvent();

    await expect(
      prisma.cableEvent.update({ where: { id: event.id }, data: { notes: "editado" } }),
    ).rejects.toThrow(/inmutable/);
  });

  it("rejects deletes", async () => {
    const { event } = await seedCableWithEvent();

    await expect(prisma.cableEvent.delete({ where: { id: event.id } })).rejects.toThrow(
      /inmutable/,
    );
    expect(await prisma.cableEvent.count()).toBe(1);
  });
});

describe("referential integrity", () => {
  it("does not delete a location that cables still reference", async () => {
    const { plant } = await seedCableWithEvent();

    await expect(prisma.location.delete({ where: { id: plant.id } })).rejects.toThrow();
    expect(await prisma.cable.count({ where: { originId: plant.id } })).toBe(1);
  });

  it("does not delete a location that has children", async () => {
    const plant = await prisma.location.create({
      data: { name: "Planta", code: "PL", type: "PLANT", path: "/PL" },
    });
    await prisma.location.create({
      data: { name: "Área 1", code: "A1", type: "AREA", path: "/PL/A1", parentId: plant.id },
    });

    await expect(prisma.location.delete({ where: { id: plant.id } })).rejects.toThrow();
  });
});

describe("cable code search index", () => {
  it("exists as a GIN trigram index", async () => {
    const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'cable_code_trgm_idx'`;

    expect(rows[0]?.indexdef).toMatch(/USING gin .*gin_trgm_ops/);
  });

  it("finds codes written without the hyphen by similarity", async () => {
    await seedCableWithEvent();

    const rows = await prisma.$queryRaw<{ code: string }[]>`
      SELECT code FROM "cable" WHERE similarity(code, 'SH50') > 0.2`;

    expect(rows.map((row) => row.code)).toContain("SH-50");
  });
});

describe("trays and routes", () => {
  async function seedRoute() {
    const tray = await prisma.tray.create({ data: { code: "99UXA00L22036", kind: "LADDER" } });
    const cable = await prisma.cable.create({
      data: {
        code: "99XAT10W2005",
        level: "L2",
        originEquipment: "99XAT10GS600",
        destinationEquipment: "99XAY10",
        routeSteps: {
          create: [
            { position: 1, label: tray.code, trayId: tray.id },
            { position: 2, label: "CONTIGUOUS PANEL" },
          ],
        },
      },
    });
    return { tray, cable };
  }

  it("keeps the route steps in order and allows steps without a tray", async () => {
    const { cable } = await seedRoute();

    const steps = await prisma.cableRouteStep.findMany({
      where: { cableId: cable.id },
      orderBy: { position: "asc" },
    });
    expect(steps.map((step) => [step.position, step.label, step.trayId !== null])).toEqual([
      [1, "99UXA00L22036", true],
      [2, "CONTIGUOUS PANEL", false],
    ]);
  });

  it("rejects two steps in the same position and positions below 1", async () => {
    const { cable } = await seedRoute();

    await expect(
      prisma.cableRouteStep.create({ data: { cableId: cable.id, position: 2, label: "X" } }),
    ).rejects.toThrow();
    await expect(
      prisma.cableRouteStep.create({ data: { cableId: cable.id, position: 0, label: "X" } }),
    ).rejects.toThrow(/cable_route_step_position_check/);
  });

  it("does not delete a tray that a route or a loose end still uses", async () => {
    const { tray, cable } = await seedRoute();
    await expect(prisma.tray.delete({ where: { id: tray.id } })).rejects.toThrow();

    await prisma.cableRouteStep.deleteMany({ where: { cableId: cable.id } });
    await prisma.cable.update({ where: { id: cable.id }, data: { looseEndTrayId: tray.id } });
    await expect(prisma.tray.delete({ where: { id: tray.id } })).rejects.toThrow();
  });

  it("rejects voltage levels outside 1-4", async () => {
    await expect(
      prisma.tray.create({ data: { code: "99UXA00L52036", kind: "LADDER", voltageLevel: 5 } }),
    ).rejects.toThrow(/tray_voltage_level_check/);
  });

  it("lists each drawing sheet of a tray only once", async () => {
    const { tray } = await seedRoute();
    const sheet = { trayId: tray.id, drawing: "XXX-DRW-0001", sheet: "04" };
    await prisma.trayDrawing.create({ data: sheet });

    await expect(prisma.trayDrawing.create({ data: sheet })).rejects.toThrow();
  });

  it("indexes tray codes and cable equipment for substring search", async () => {
    const rows = await prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE indexname IN (
        'tray_code_trgm_idx',
        'cable_origin_equipment_trgm_idx',
        'cable_destination_equipment_trgm_idx'
      )`;

    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.indexdef).toMatch(/USING gin .*gin_trgm_ops/);
  });
});
