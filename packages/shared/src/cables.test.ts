import { describe, expect, it } from "vitest";
import {
  CABLE_ACTIONS,
  CABLE_ACTION_LABELS,
  CABLE_FIELD_LABELS,
  CABLE_TEXT_LIMITS,
  PROJECT_FIELD_LABELS,
  createCableSchema,
  deleteCableSchema,
  diffFields,
  formatDecimal,
  updateCableSchema,
  validateInitialStatus,
} from "./cables";

const base = {
  code: "sh50",
  installationStatus: "IN_STOCK",
  connectionStatus: "DISCONNECTED",
  currentLocationId: "store",
};

function issues(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe("PROJECT_FIELD_LABELS", () => {
  it("names every field the load of the lists can change, without clashing with the form", () => {
    for (const label of Object.values(PROJECT_FIELD_LABELS)) expect(label).toBeTruthy();
    for (const field of Object.keys(PROJECT_FIELD_LABELS)) {
      expect(Object.keys(CABLE_FIELD_LABELS)).not.toContain(field);
    }
  });
});

describe("createCableSchema", () => {
  it("normalizes the code and turns empty fields into null", () => {
    const parsed = createCableSchema.parse({ ...base, description: "  ", typeId: "", notes: "" });

    expect(parsed).toMatchObject({
      code: "SH-50",
      description: null,
      typeId: null,
      notes: null,
      conductors: null,
      lengthM: null,
    });
  });

  it("accepts decimals written with a comma or a dot", () => {
    const parsed = createCableSchema.parse({
      ...base,
      crossSectionMm2: "2,5",
      outerDiameterMm: "11.40",
      lengthM: " 120 ",
      conductors: "3",
    });

    expect(parsed).toMatchObject({
      crossSectionMm2: 2.5,
      outerDiameterMm: 11.4,
      lengthM: 120,
      conductors: 3,
    });
  });

  it.each([
    ["crossSectionMm2", "2,555"],
    ["crossSectionMm2", "-1"],
    ["lengthM", "0"],
    ["lengthM", "1.000,5"],
    ["outerDiameterMm", "abc"],
    ["conductors", "2.5"],
    ["conductors", "0"],
  ])("rejects %s = %j", (field, value) => {
    expect(createCableSchema.safeParse({ ...base, [field]: value }).success).toBe(false);
  });

  it("accepts the same room at both ends (two pieces of equipment of one room)", () => {
    const result = createCableSchema.safeParse({ ...base, originId: "a", destinationId: "a" });

    expect(result.success).toBe(true);
  });

  it("registers a cable as not yet checked, without a location", () => {
    const result = createCableSchema.safeParse({
      ...base,
      installationStatus: "UNVERIFIED",
      currentLocationId: "",
    });

    expect(result.success).toBe(true);
  });

  it("checks that the initial status is coherent", () => {
    const result = createCableSchema.safeParse({ ...base, connectionStatus: "CONNECTED" });

    expect(issues(result)).toContain("Solo un cable tendido puede estar conectado.");
  });

  // Revisión F0-F7 (B4): `Number("1e2")` es 100 y `Number("0x10")` es 16.
  it.each(["1e2", "0x10", "1.0", "-3", "3 hilos"])(
    "rejects %j as a number of conductors",
    (conductors) => {
      const result = createCableSchema.safeParse({ ...base, conductors });

      expect(issues(result)).toContain("Nº de conductores: un número entero entre 1 y 500");
    },
  );

  it("accepts a plain number of conductors, with spaces around", () => {
    expect(createCableSchema.parse({ ...base, conductors: " 12 " }).conductors).toBe(12);
  });

  it("says that 0 is not a valid measure", () => {
    const result = createCableSchema.safeParse({ ...base, lengthM: "0" });

    expect(issues(result)).toContain("Longitud: debe ser mayor que 0 y como máximo 100000");
  });

  // Revisión F0-F7 (M5): el formulario admitía 200 y la carga de los listados, 500; un
  // cable cargado con una descripción larga no se podía volver a guardar.
  it("accepts texts as long as the limits shared with the load of the lists", () => {
    const longest = {
      ...base,
      description: "d".repeat(CABLE_TEXT_LIMITS.description),
      voltageRating: "v".repeat(CABLE_TEXT_LIMITS.voltageRating),
      notes: "n".repeat(CABLE_TEXT_LIMITS.notes),
    };

    expect(createCableSchema.safeParse(longest).success).toBe(true);
    expect(
      issues(createCableSchema.safeParse({ ...longest, description: `${longest.description}d` })),
    ).toContain(`Descripción: máximo ${CABLE_TEXT_LIMITS.description} caracteres`);
  });

  it("rejects invalid codes", () => {
    expect(createCableSchema.safeParse({ ...base, code: "SH#50" }).success).toBe(false);
  });
});

describe("validateInitialStatus", () => {
  const ends = { originId: "o", destinationId: "d", currentLocationId: null };

  it("accepts a laid and connected cable with both ends", () => {
    expect(
      validateInitialStatus({ ...ends, installationStatus: "LAID", connectionStatus: "CONNECTED" }),
    ).toBeNull();
  });

  it("requires both ends for a laid cable", () => {
    expect(
      validateInitialStatus({
        ...ends,
        destinationId: null,
        installationStatus: "LAID",
        connectionStatus: "DISCONNECTED",
      }),
    ).toMatch(/origen y destino/);
  });

  it("requires a current location for stored or coiled cables", () => {
    expect(
      validateInitialStatus({
        ...ends,
        installationStatus: "COILED",
        connectionStatus: "DISCONNECTED",
      }),
    ).toMatch(/dónde está/);
  });

  it("does not register retired cables", () => {
    expect(
      validateInitialStatus({
        ...ends,
        installationStatus: "RETIRED",
        connectionStatus: "DISCONNECTED",
      }),
    ).toMatch(/retirado/);
  });
});

describe("updateCableSchema and deleteCableSchema", () => {
  it("requires the version for optimistic concurrency", () => {
    expect(updateCableSchema.safeParse({ id: "c1", code: "SH-1" }).success).toBe(false);
    expect(updateCableSchema.parse({ id: "c1", code: "SH-1", version: "3" }).version).toBe(3);
  });

  it("requires a reason to delete", () => {
    expect(deleteCableSchema.safeParse({ id: "c1", version: "1", reason: " " }).success).toBe(
      false,
    );
    expect(deleteCableSchema.parse({ id: "c1", version: "1", reason: " Duplicado " }).reason).toBe(
      "Duplicado",
    );
  });
});

describe("diffFields", () => {
  it("lists only the fields that changed, in order", () => {
    expect(
      diffFields(
        ["code", "lengthM", "notes"],
        { code: "SH-1", lengthM: 10, notes: null },
        { code: "SH-1", lengthM: 12.5, notes: "Revisado" },
      ),
    ).toEqual({ lengthM: { from: 10, to: 12.5 }, notes: { from: null, to: "Revisado" } });
  });

  it("returns an empty object when nothing changed", () => {
    expect(diffFields(["code"], { code: "A" }, { code: "A" })).toEqual({});
  });
});

describe("labels", () => {
  it("has a Spanish label for every action", () => {
    for (const action of CABLE_ACTIONS) {
      expect(CABLE_ACTION_LABELS[action]).toBeTruthy();
    }
  });

  it("formats decimals with a comma", () => {
    expect(formatDecimal(2.5)).toBe("2,5");
    expect(formatDecimal(null)).toBe("");
  });
});
