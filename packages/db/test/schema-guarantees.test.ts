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
    'TRUNCATE "cable_event", "cable", "location", "cable_type", "color", "manufacturer", "user" CASCADE',
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
