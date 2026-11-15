import { describe, expect, it } from "vitest";
import { decodeRouteParam, deletedCableCode } from "./route-params";

// Revisión F0-F7 (B3): cualquier texto de `?deleted=` salía dentro de un aviso de la app.
describe("deletedCableCode", () => {
  it("accepts a cable code as the app writes it", () => {
    expect(deletedCableCode("99XAT10W2005")).toBe("99XAT10W2005");
    expect(deletedCableCode("SH-50")).toBe("SH-50");
  });

  it.each([
    undefined,
    "",
    ["99XAT10W2005", "otro"],
    "X no existe. Llama al 600 000 000",
    "<b>x</b>",
    "x".repeat(51),
  ])("ignores %j", (value) => {
    expect(deletedCableCode(value)).toBeUndefined();
  });
});

describe("decodeRouteParam", () => {
  it("decodes an encoded segment and leaves a plain one alone", () => {
    expect(decodeRouteParam("99UM%5F00L22037")).toBe("99UM_00L22037");
    expect(decodeRouteParam("99UXA00L22036")).toBe("99UXA00L22036");
  });

  // Revisión F0-F7 (B16): un "%" suelto lanzaba URIError y la página respondía con un error.
  it("returns null for a segment that is not valid percent-encoding", () => {
    expect(decodeRouteParam("100%")).toBeNull();
    expect(decodeRouteParam("%E0%A4%A")).toBeNull();
  });
});
