import { describe, expect, it } from "vitest";
import { generateSeedData } from "../prisma/seed-data";

const data = generateSeedData();
const locationsById = new Map(data.locations.map((location) => [location.id, location]));

describe("generateSeedData", () => {
  it("is deterministic for the same seed", () => {
    expect(generateSeedData({ cables: 50 })).toEqual(generateSeedData({ cables: 50 }));
    expect(generateSeedData({ cables: 50, seed: 1 })).not.toEqual(
      generateSeedData({ cables: 50, seed: 2 }),
    );
  });

  it("creates ~5.000 cables with unique normalized codes", () => {
    const codes = data.cables.map((cable) => cable.code);

    expect(codes).toHaveLength(5000);
    expect(new Set(codes).size).toBe(5000);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z]+-\d+$/);
    }
    expect(codes).toContain("SH-50");
  });

  it("builds a valid Planta → Área → Unidad → Sitio tree with consistent paths", () => {
    const expectedParent = { PLANT: null, AREA: "PLANT", UNIT: "AREA", SITE: "UNIT" } as const;
    const codes = data.locations.map((location) => location.code);

    expect(new Set(codes).size).toBe(codes.length);
    for (const location of data.locations) {
      const parent = location.parentId ? locationsById.get(location.parentId) : null;
      expect(parent?.type ?? null).toBe(expectedParent[location.type]);
      expect(location.path).toBe(`${parent?.path ?? ""}/${location.code}`);
      expect(location.code).toMatch(/^[A-Z0-9][A-Z0-9-]*$/);
    }
  });

  it("only references existing sites and catalog items", () => {
    const ids = (items: { id: string }[]) => new Set(items.map((item) => item.id));
    const types = ids(data.cableTypes);
    const colors = ids(data.colors);
    const manufacturers = ids(data.manufacturers);

    for (const cable of data.cables) {
      for (const locationId of [cable.originId, cable.destinationId, cable.currentLocationId]) {
        if (locationId !== null) {
          expect(locationsById.get(locationId)?.type).toBe("SITE");
        }
      }
      expect(cable.originId).not.toBe(cable.destinationId);
      expect(types.has(cable.typeId)).toBe(true);
      expect(colors.has(cable.colorId)).toBe(true);
      expect(manufacturers.has(cable.manufacturerId)).toBe(true);
    }
  });

  it("keeps installation and connection statuses consistent", () => {
    for (const cable of data.cables) {
      if (cable.installationStatus !== "LAID") {
        expect(cable.connectionStatus).toBe("DISCONNECTED");
      }
      if (cable.installationStatus === "IN_STOCK" || cable.installationStatus === "COILED") {
        expect(cable.currentLocationId).not.toBeNull();
      }
    }
    const statuses = new Set(data.cables.map((cable) => cable.installationStatus));
    expect(statuses).toEqual(new Set(["IN_STOCK", "COILED", "LAID", "RETIRED"]));
  });

  it("uses distinct catalog names and valid hex colors", () => {
    for (const items of [data.cableTypes, data.colors, data.manufacturers]) {
      const names = items.map((item) => item.name.toLowerCase());
      expect(new Set(names).size).toBe(names.length);
    }
    for (const color of data.colors) {
      expect(color.hex).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
