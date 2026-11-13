import { prisma } from "@cables/db";
import { parseCableSearch } from "@cables/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { searchCables } from "./search";

const ids = {
  plant: "plant",
  areaA: "area-a",
  siteA1: "site-a1",
  areaB: "area-b",
  siteB1: "site-b1",
  control: "type-control",
  power: "type-power",
};

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "cable_event", "cable", "tray", "location", "cable_type", "color", "manufacturer", "user" CASCADE',
  );
  await prisma.location.createMany({
    data: [
      { id: ids.plant, name: "Norte", code: "N", type: "PLANT", path: "/N" },
      {
        id: ids.areaA,
        name: "Calderas",
        code: "A",
        type: "AREA",
        path: "/N/A",
        parentId: ids.plant,
      },
      {
        id: ids.siteA1,
        name: "Bandeja",
        code: "A1",
        type: "UNIT",
        path: "/N/A/A1",
        parentId: ids.areaA,
      },
      {
        id: ids.areaB,
        name: "Turbinas",
        code: "B",
        type: "AREA",
        path: "/N/B",
        parentId: ids.plant,
      },
      {
        id: ids.siteB1,
        name: "Armario",
        code: "B1",
        type: "UNIT",
        path: "/N/B/B1",
        parentId: ids.areaB,
      },
    ],
  });
  await prisma.cableType.createMany({
    data: [
      { id: ids.control, name: "Control" },
      { id: ids.power, name: "Potencia" },
    ],
  });
  await prisma.cable.createMany({
    data: [
      {
        code: "SH-5",
        typeId: ids.control,
        lengthM: 10,
        crossSectionMm2: 1.5,
        originId: ids.siteA1,
      },
      {
        code: "SH-50",
        typeId: ids.control,
        lengthM: 300,
        crossSectionMm2: 2.5,
        originId: ids.siteA1,
        destinationId: ids.siteB1,
        installationStatus: "LAID",
        connectionStatus: "CONNECTED",
      },
      {
        code: "SH-500",
        typeId: ids.control,
        lengthM: 50,
        crossSectionMm2: 16,
        originId: ids.siteB1,
      },
      { code: "SH-10", typeId: ids.control, originId: ids.siteB1 },
      {
        code: "PW-50",
        typeId: ids.power,
        lengthM: 120,
        crossSectionMm2: 95,
        currentLocationId: ids.siteA1,
        installationStatus: "COILED",
        description: "Alimentación bomba de agua",
      },
      { code: "SH-51", typeId: ids.control, deletedAt: new Date() },
      { code: "AB-1", description: "Carga al 100% revisada" },
    ],
  });
});

const search = (params: Record<string, string>, pageSize?: number) =>
  searchCables(parseCableSearch(params), pageSize);
const codes = async (params: Record<string, string>, pageSize?: number) =>
  (await search(params, pageSize)).items.map((item) => item.code);

describe("searchCables: text", () => {
  it('finds "SH-50" first when typing "sh50", without unrelated short codes', async () => {
    const result = await search({ q: "sh50" });

    expect(result.items.map((item) => item.code)).toEqual(["SH-50", "SH-500"]);
    expect(result.fuzzy).toBeUndefined();
  });

  // Regresión: con la similitud de trigramas siempre activa, "sh50" devolvía más de
  // 1.000 de los 5.000 cables del seed. Ahora solo se usa si no hay coincidencias.
  it("falls back to similar codes only when nothing contains the text", async () => {
    const result = await search({ q: "shh50" });

    expect(result.fuzzy).toBe(true);
    expect(result.items[0]?.code).toBe("SH-50");
    expect(result.items.map((item) => item.code)).not.toContain("PW-50");
  });

  it("puts the exact code first among partial matches", async () => {
    expect((await codes({ q: "sh 5" }))[0]).toBe("SH-5");
  });

  it("also searches the description", async () => {
    expect(await codes({ q: "bomba" })).toEqual(["PW-50"]);
  });

  it("treats LIKE wildcards typed by the user literally", async () => {
    expect(await codes({ q: "%" })).toEqual(["AB-1"]);
    expect(await codes({ q: "100%" })).toEqual(["AB-1"]);
  });

  // Regresión: "_" o "-" quedan vacíos al normalizar el código y "ILIKE '%%'"
  // devolvía todos los cables.
  it("does not match everything when the text is only punctuation", async () => {
    expect(await codes({ q: "_" })).toEqual([]);
    expect(await codes({ q: "--" })).toEqual([]);
  });
});

describe("searchCables: filters", () => {
  it("includes cables anywhere in the location subtree, by origin, destination or current place", async () => {
    expect(await codes({ location: ids.areaA })).toEqual(["PW-50", "SH-5", "SH-50"]);
    expect(await codes({ location: ids.plant })).toHaveLength(5);
    expect(await codes({ location: "missing" })).toEqual([]);
  });

  it("combines catalog, status and range filters", async () => {
    expect(await codes({ type: ids.control, sectionMin: "2", sectionMax: "20" })).toEqual([
      "SH-50",
      "SH-500",
    ]);
    expect(await codes({ installation: "LAID", connection: "CONNECTED" })).toEqual(["SH-50"]);
    expect(await codes({ lengthMin: "50", lengthMax: "120" })).toEqual(["PW-50", "SH-500"]);
  });

  it("never returns retired (soft-deleted) cables", async () => {
    expect(await codes({ q: "SH-51" })).not.toContain("SH-51");
  });
});

describe("searchCables: sorting and paging", () => {
  it("sorts codes naturally (SH-5, SH-10, SH-50, SH-500)", async () => {
    expect(await codes({ type: ids.control })).toEqual(["SH-5", "SH-10", "SH-50", "SH-500"]);
    expect(await codes({ type: ids.control, dir: "desc" })).toEqual([
      "SH-500",
      "SH-50",
      "SH-10",
      "SH-5",
    ]);
  });

  it("sorts by length leaving cables without length at the end", async () => {
    expect(await codes({ type: ids.control, sort: "length", dir: "desc" })).toEqual([
      "SH-50",
      "SH-500",
      "SH-5",
      "SH-10",
    ]);
  });

  it("pages on the server and clamps a page out of range", async () => {
    const first = await search({ type: ids.control }, 3);
    const second = await search({ type: ids.control, page: "2" }, 3);
    const beyond = await search({ type: ids.control, page: "9" }, 3);

    expect(first).toMatchObject({ total: 4, page: 1, pageCount: 2 });
    expect(first.items.map((item) => item.code)).toEqual(["SH-5", "SH-10", "SH-50"]);
    expect(second.items.map((item) => item.code)).toEqual(["SH-500"]);
    expect(beyond).toMatchObject({ page: 2, pageCount: 2 });
  });

  it("returns readable names for the table", async () => {
    const [item] = (await search({ q: "SH-50" })).items;

    expect(item).toMatchObject({
      code: "SH-50",
      type: "Control",
      origin: "Calderas › Bandeja",
      destination: "Turbinas › Armario",
      lengthM: 300,
      crossSectionMm2: 2.5,
    });
  });
});

describe("searchCables: who / what / when", () => {
  async function seedEvents() {
    const [juan, ana] = await Promise.all(
      ["Juan", "Ana"].map((name) =>
        prisma.user.create({
          data: { id: name.toLowerCase(), name, email: `${name}@cables.test`, role: "TECHNICIAN" },
        }),
      ),
    );
    const cable = (code: string) =>
      prisma.cable.findUniqueOrThrow({ where: { code }, select: { id: true } });
    const [sh50, pw50, sh5] = await Promise.all([cable("SH-50"), cable("PW-50"), cable("SH-5")]);
    await prisma.cableEvent.createMany({
      data: [
        // Juan conectó SH-50 el 10 de noviembre (23:30 en Madrid sigue siendo el 10).
        {
          cableId: sh50.id,
          userId: juan!.id,
          action: "CONNECTED",
          changes: {},
          createdAt: new Date("2026-11-10T22:30:00Z"),
        },
        // Juan movió PW-50 el 11; Ana conectó PW-50 el 11.
        {
          cableId: pw50.id,
          userId: juan!.id,
          action: "MOVED",
          changes: {},
          createdAt: new Date("2026-11-11T09:00:00Z"),
        },
        {
          cableId: pw50.id,
          userId: ana!.id,
          action: "CONNECTED",
          changes: {},
          createdAt: new Date("2026-11-11T10:00:00Z"),
        },
        {
          cableId: sh5.id,
          userId: ana!.id,
          action: "LAID",
          changes: {},
          createdAt: new Date("2026-11-12T08:00:00Z"),
        },
      ],
    });
    await prisma.cable.update({
      where: { id: sh5.id },
      data: { lastAction: "LAID", lastActionAt: new Date("2026-11-12T08:00:00Z") },
    });
  }

  it("finds the cables a person connected, combining both conditions on the same event", async () => {
    await seedEvents();

    // PW-50 tiene un evento de Juan y otro de conexión, pero no uno de Juan conectando.
    expect(await codes({ actor: "juan", action: "CONNECTED" })).toEqual(["SH-50"]);
    expect(await codes({ action: "CONNECTED" })).toEqual(["PW-50", "SH-50"]);
    expect(await codes({ actor: "ana" })).toEqual(["PW-50", "SH-5"]);
  });

  it("counts days in Madrid time", async () => {
    await seedEvents();

    // 22:30 UTC del 10 son las 23:30 del 10 en Madrid: entra el 10, no el 11.
    expect(await codes({ from: "2026-11-10", to: "2026-11-10" })).toEqual(["SH-50"]);
    expect(await codes({ from: "2026-11-11", to: "2026-11-11" })).toEqual(["PW-50"]);
    expect(await codes({ from: "2026-11-12" })).toEqual(["SH-5"]);
  });

  it("sorts by the last field action, newest first and cables without one last", async () => {
    await seedEvents();

    const result = await codes({ sort: "activity" });
    expect(result[0]).toBe("SH-5");
  });
});
