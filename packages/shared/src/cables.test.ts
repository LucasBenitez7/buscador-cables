import { describe, expect, it } from "vitest";
import {
  CABLE_ACTIONS,
  CABLE_ACTION_LABELS,
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

  it("checks that the initial status is coherent", () => {
    const result = createCableSchema.safeParse({ ...base, connectionStatus: "CONNECTED" });

    expect(issues(result)).toContain("Solo un cable tendido puede estar conectado.");
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
