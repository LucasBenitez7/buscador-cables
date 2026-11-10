import { describe, expect, it } from "vitest";
import {
  CATALOG_KINDS,
  CATALOG_LABELS,
  createCatalogItemSchema,
  deleteCatalogItemSchema,
  updateCatalogItemSchema,
} from "./catalogs";

describe("catalog schemas", () => {
  it("trims and collapses spaces in the name", () => {
    const parsed = createCatalogItemSchema.parse({ kind: "cableType", name: "  Fibra   óptica " });

    expect(parsed).toEqual({ kind: "cableType", name: "Fibra óptica", hex: null });
  });

  it("normalizes the hex color and treats empty as no color", () => {
    expect(createCatalogItemSchema.parse({ kind: "color", name: "Rojo", hex: "#c0392b" }).hex).toBe(
      "#C0392B",
    );
    expect(createCatalogItemSchema.parse({ kind: "color", name: "Rojo", hex: "" }).hex).toBeNull();
  });

  it.each(["red", "#FFF", "#GGGGGG", "C0392B"])("rejects the hex %j", (hex) => {
    expect(createCatalogItemSchema.safeParse({ kind: "color", name: "Rojo", hex }).success).toBe(
      false,
    );
  });

  it("rejects empty names and unknown catalogs", () => {
    expect(createCatalogItemSchema.safeParse({ kind: "color", name: "   " }).success).toBe(false);
    expect(createCatalogItemSchema.safeParse({ kind: "voltage", name: "1 kV" }).success).toBe(
      false,
    );
  });

  it("requires an id to update or delete", () => {
    expect(updateCatalogItemSchema.safeParse({ kind: "color", name: "Rojo" }).success).toBe(false);
    expect(deleteCatalogItemSchema.safeParse({ kind: "color", id: "" }).success).toBe(false);
  });

  it("has Spanish labels for every catalog", () => {
    for (const kind of CATALOG_KINDS) {
      expect(CATALOG_LABELS[kind].plural.length).toBeGreaterThan(0);
    }
  });
});
