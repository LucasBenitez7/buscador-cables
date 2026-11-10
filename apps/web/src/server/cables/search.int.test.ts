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
    'TRUNCATE "cable_event", "cable", "location", "cable_type", "color", "manufacturer", "user" CASCADE',
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
  it('finds "SH-50" first when typing "sh50"', async () => {
    const result = await codes({ q: "sh50" });

    expect(result[0]).toBe("SH-50");
    expect(result).toContain("SH-500");
    expect(result).not.toContain("SH-51");
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
