import { prisma } from "@cables/db";
import { parseActivitySearch } from "@cables/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { listActivity } from "./service";

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "cable_event", "cable", "location", "cable_type", "color", "manufacturer", "user" CASCADE',
  );
  await prisma.user.createMany({
    data: [
      { id: "juan", name: "Juan Pérez", email: "juan@cables.test", role: "TECHNICIAN" },
      { id: "ana", name: "Ana Ruiz", email: "ana@cables.test", role: "SUPERVISOR" },
    ],
  });
  await prisma.location.createMany({
    data: [
      { id: "n", name: "Norte", code: "N", type: "PLANT", path: "/N" },
      { id: "alm", name: "Almacén", code: "ALM", type: "AREA", path: "/N/ALM", parentId: "n" },
      { id: "pat", name: "Patio", code: "PAT", type: "AREA", path: "/N/PAT", parentId: "n" },
    ],
  });
  await prisma.cable.createMany({
    data: [
      { id: "c1", code: "SH-50" },
      { id: "c2", code: "PW-1", deletedAt: new Date() },
    ],
  });
  await prisma.cableEvent.createMany({
    data: [
      {
        id: "e1",
        cableId: "c1",
        userId: "juan",
        action: "MOVED",
        fromLocationId: "alm",
        toLocationId: "pat",
        changes: { currentLocationId: { from: "alm", to: "pat" } },
        notes: "Para la parada",
        // 23:30 del 10 de noviembre en Madrid (invierno, UTC+1).
        createdAt: new Date("2026-11-10T22:30:00Z"),
      },
      {
        id: "e2",
        cableId: "c1",
        userId: "ana",
        action: "CONNECTED",
        changes: { connectionStatus: { from: "DISCONNECTED", to: "ORIGIN_ONLY" } },
        createdAt: new Date("2026-11-11T08:00:00Z"),
      },
      {
        id: "e3",
        cableId: "c2",
        userId: "juan",
        action: "RETIRED",
        changes: {},
        // 00:30 del 1 de julio en Madrid (verano, UTC+2).
        createdAt: new Date("2026-06-30T22:30:00Z"),
      },
    ],
  });
});

const list = (params: Record<string, string>, pageSize?: number) =>
  listActivity(parseActivitySearch(params), pageSize);
const ids = async (params: Record<string, string>) =>
  (await list(params)).entries.map((entry) => entry.id);

describe("listActivity", () => {
  it("lists every action newest first, as readable sentences", async () => {
    const page = await list({});

    expect(page.entries.map((entry) => entry.id)).toEqual(["e2", "e1", "e3"]);
    expect(page.entries[1]).toMatchObject({
      user: "Juan Pérez",
      cable: { id: "c1", code: "SH-50", deleted: false },
      summary: "movió el cable de Norte › Almacén a Norte › Patio",
      notes: "Para la parada",
      changes: [{ field: "Ubicación actual", from: "Norte › Almacén", to: "Norte › Patio" }],
    });
    expect(page.entries[0]?.summary).toBe("conectó el extremo de origen");
    expect(page.entries[2]?.cable.deleted).toBe(true);
  });

  it("filters by person and by action", async () => {
    expect(await ids({ actor: "juan" })).toEqual(["e1", "e3"]);
    expect(await ids({ actor: "juan", action: "RETIRED" })).toEqual(["e3"]);
    expect(await ids({ action: "CONNECTED" })).toEqual(["e2"]);
  });

  it("counts days in Madrid time, in winter and in summer", async () => {
    expect(await ids({ from: "2026-11-10", to: "2026-11-10" })).toEqual(["e1"]);
    expect(await ids({ from: "2026-11-11" })).toEqual(["e2"]);
    expect(await ids({ from: "2026-07-01", to: "2026-07-01" })).toEqual(["e3"]);
    expect(await ids({ to: "2026-06-30" })).toEqual([]);
  });

  it("paginates and clamps a page past the end", async () => {
    const second = await list({ page: "2" }, 2);
    expect(second).toMatchObject({ total: 3, page: 2, pageCount: 2 });
    expect(second.entries.map((entry) => entry.id)).toEqual(["e3"]);

    expect((await list({ page: "9" }, 2)).page).toBe(2);
    expect(await list({ actor: "nadie" })).toEqual({
      entries: [],
      total: 0,
      page: 1,
      pageCount: 0,
    });
  });
});
