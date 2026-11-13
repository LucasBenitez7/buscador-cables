import { describe, expect, it } from "vitest";
import { generateSeedData } from "../prisma/seed-data";

const data = generateSeedData();
const locationsById = new Map(data.locations.map((location) => [location.id, location]));
const traysById = new Map(data.trays.map((tray) => [tray.id, tray]));
function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  }
  return groups;
}
const stepsByCable = groupBy(data.routeSteps, (step) => step.cableId);

/** Same codification as `parseTrayCode` in @cables/shared (docs/DATOS-PROYECTO.md). */
const TRAY_CODE = /^\d{2}[A-Z][A-Z_]{2}[0-9_][0-9]([A-Z])(\d)(\d)\d{3,4}$/;

describe("generateSeedData", () => {
  it("is deterministic for the same seed", () => {
    expect(generateSeedData({ cables: 50 })).toEqual(generateSeedData({ cables: 50 }));
    expect(generateSeedData({ cables: 50, seed: 1 })).not.toEqual(
      generateSeedData({ cables: 50, seed: 2 }),
    );
  });

  it("creates ~4.500 invented cables with unique KKS-like codes of unit 99", () => {
    const codes = data.cables.map((cable) => cable.code);

    expect(codes).toHaveLength(4500);
    expect(new Set(codes).size).toBe(4500);
    for (const cable of data.cables) {
      const pattern =
        cable.level === "L1" ? /^99[A-Z]{3}\d{2}[A-Z]\d-W8\d{3}$/ : /^99[A-Z]{3}\d{2}W\d{4}$/;
      expect(cable.code).toMatch(pattern);
    }
  });

  it("mixes the four levels with instrumentation as the largest group", () => {
    const byLevel = groupBy(data.cables, (cable) => cable.level);

    expect([...byLevel.keys()].sort()).toEqual(["L1", "L2", "L3", "L4"]);
    expect(byLevel.get("L1")!.length).toBeGreaterThan(byLevel.get("L2")!.length);
    // Single-core cables come in parallel circuits: "1 de 3", "2 de 3"...
    for (const cable of byLevel.get("L3")!) {
      expect(cable.circuit).toMatch(/^\d de [2-4]$/);
    }
  });

  it("builds a Planta → Área → Unidad (edificio) → Sitio (sala) tree", () => {
    const expectedParent = { PLANT: null, AREA: "PLANT", UNIT: "AREA", SITE: "UNIT" } as const;
    const codes = data.locations.map((location) => location.code);

    expect(new Set(codes).size).toBe(codes.length);
    for (const location of data.locations) {
      const parent = location.parentId ? locationsById.get(location.parentId) : null;
      expect(parent?.type ?? null).toBe(expectedParent[location.type]);
      expect(location.path).toBe(`${parent?.path ?? ""}/${location.code}`);
      expect(location.code).toMatch(/^[A-Z0-9][A-Z0-9-]*$/);
    }
    // A room code starts with the code of its building: "99UXA16RA001" in "99UXA".
    for (const site of data.locations.filter((location) => location.type === "SITE")) {
      expect(site.code.startsWith(locationsById.get(site.parentId!)!.code.replace(/-1$/, ""))).toBe(
        true,
      );
    }
  });

  it("codifies every tray like the drawings and links it to its building and sheet", () => {
    const sheets = new Map(data.trayDrawings.map((drawing) => [drawing.trayId, drawing]));
    const kinds: Record<string, string> = {
      L: "LADDER",
      W: "GRID",
      C: "CONDUIT",
      D: "DUCT",
    };

    expect(new Set(data.trays.map((tray) => tray.code)).size).toBe(data.trays.length);
    for (const tray of data.trays) {
      const match = TRAY_CODE.exec(tray.code);
      expect(match, tray.code).not.toBeNull();
      expect(tray.kind).toBe(kinds[match![1]!]);
      expect(tray.voltageLevel).toBe(Number(match![2]));
      expect(tray.elevationLevel).toBe(Number(match![3]));
      expect(locationsById.get(tray.locationId)?.type).toBe("UNIT");
      expect(tray.code.startsWith(tray.areaCode)).toBe(true);
      expect(sheets.get(tray.id)?.drawing).toMatch(/^EJ-(ELE|ICO)-DRW-\d{4}$/);
      // Ladders and grids have a width; conduits and ducts, a diameter.
      expect(
        tray.kind === "CONDUIT" || tray.kind === "DUCT" ? tray.diameterMm : tray.widthMm,
      ).toBeGreaterThan(0);
    }
  });

  it("routes cables in order through trays of their own voltage level", () => {
    for (const [cableId, steps] of stepsByCable) {
      const cable = data.cables.find((candidate) => candidate.id === cableId)!;
      expect(steps.map((step) => step.position)).toEqual(steps.map((_, index) => index + 1));
      for (const step of steps) {
        if (step.trayId === null) {
          expect(["CONTIGUOUS PANEL", "TRAM. VERTICAL"]).toContain(step.label);
          continue;
        }
        const tray = traysById.get(step.trayId)!;
        expect(step.label).toBe(tray.code);
        expect(`L${tray.voltageLevel}`).toBe(cable.level);
        // Instrumentation routes say whether a tray is in the field or in the room.
        expect(step.section === null).toBe(cable.level !== "L1");
      }
    }
    // Power cables always have a route; many instrumentation cables are local.
    const withoutRoute = data.cables.filter((cable) => !stepsByCable.has(cable.id));
    expect(withoutRoute.length).toBeGreaterThan(0);
    for (const cable of withoutRoute) {
      expect(cable.level).toBe("L1");
      expect(cable.originId).toBe(cable.destinationId);
    }
  });

  it("fills both ends like the lists do", () => {
    for (const cable of data.cables) {
      expect(cable.originEquipment).toMatch(/^99[A-Z0-9]+$/);
      expect(cable.destinationEquipment).toMatch(/^99[A-Z0-9]+$/);
      expect(locationsById.get(cable.originId)?.type).toBe("SITE");
      expect(locationsById.get(cable.destinationId)?.type).toBe("SITE");
      if (cable.level === "L1") {
        expect(cable.originRoom).toBe(locationsById.get(cable.originId)!.code);
        expect(cable.originGland).not.toBeNull();
        expect(cable.diagram).toMatch(/^EJ-ICO-DIA-/);
      } else {
        expect(cable.originFunctionKks).toBe(`=${cable.originEquipment}00GS101`);
        expect(cable.composition).not.toBeNull();
      }
      expect(cable.sourceDocument).toMatch(/^EJ-(ELE|ICO)-LST-\d{4}$/);
    }
  });

  it("keeps every field status coherent, including the loose ends", () => {
    for (const cable of data.cables) {
      const { installationStatus: status, connectionStatus: connection } = cable;
      if (status !== "LAID" && status !== "PARTIALLY_LAID") {
        expect(connection).toBe("DISCONNECTED");
      }
      expect(cable.currentLocationId !== null).toBe(status === "IN_STOCK" || status === "COILED");
      expect(cable.looseEnd !== null).toBe(status === "PARTIALLY_LAID");
      if (status === "PARTIALLY_LAID") {
        const routeTrays = stepsByCable.get(cable.id)!.map((step) => step.trayId);
        expect(routeTrays).toContain(cable.looseEndTrayId);
        // The loose end is never connected.
        const looseBit = cable.looseEnd === "ORIGIN" ? "ORIGIN_ONLY" : "DESTINATION_ONLY";
        expect([looseBit, "CONNECTED"]).not.toContain(connection);
      } else {
        expect(cable.looseEndTrayId).toBeNull();
      }
    }
    const statuses = new Set(data.cables.map((cable) => cable.installationStatus));
    expect(statuses).toEqual(
      new Set(["UNVERIFIED", "IN_STOCK", "COILED", "PARTIALLY_LAID", "LAID", "RETIRED"]),
    );
  });

  it("only references existing cable types, and the project types carry conductors", () => {
    const types = new Map(data.cableTypes.map((type) => [type.id, type]));

    expect(new Set(data.cableTypes.map((type) => type.name)).size).toBe(data.cableTypes.length);
    for (const cable of data.cables) {
      const type = types.get(cable.typeId);
      expect(type).toBeDefined();
      // Power types have a code ("Q0825"); instrumentation types do not.
      expect(type!.code === null).toBe(cable.level === "L1");
    }
  });

  it("keeps the catalogs with distinct names and valid hex colors", () => {
    for (const items of [data.colors, data.manufacturers]) {
      const names = items.map((item) => item.name.toLowerCase());
      expect(new Set(names).size).toBe(names.length);
    }
    for (const color of data.colors) {
      expect(color.hex).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
