import { describe, expect, it } from "vitest";
import {
  CABLE_LEVELS,
  CABLE_LEVEL_LABELS,
  TRAY_KINDS,
  TRAY_KIND_LABELS,
  formatTraySize,
  isTrayCode,
  parseTraySearch,
  normalizeTrayCode,
  parseTrayCode,
  parseTraySize,
  trayQuery,
} from "./trays";

describe("parseTrayCode", () => {
  it("reads every part of a ladder tray code", () => {
    expect(parseTrayCode("99UXA00L22036")).toEqual({
      code: "99UXA00L22036",
      kind: "LADDER",
      voltageLevel: 2,
      elevationLevel: 2,
      areaCode: "99UXA",
      orderNumber: "036",
    });
  });

  it("accepts areas padded with '_' and sub-zones that start with '_'", () => {
    expect(parseTrayCode("99UX_01L10002")).toMatchObject({ areaCode: "99UX", kind: "LADDER" });
    expect(parseTrayCode("99UXT_2D12070")).toMatchObject({
      areaCode: "99UXT",
      kind: "DUCT",
      voltageLevel: 1,
      elevationLevel: 2,
      orderNumber: "070",
    });
  });

  it("maps each letter to its kind and unknown letters to OTHER", () => {
    expect(parseTrayCode("99UXA01W10011")?.kind).toBe("GRID");
    expect(parseTrayCode("99UXA00S21104")?.kind).toBe("SPECIAL");
    expect(parseTrayCode("99UXA00C20149")?.kind).toBe("CONDUIT");
    expect(parseTrayCode("99UXN01T19996")?.kind).toBe("OTHER");
  });

  it("parses long runs of '_' quickly (no backtracking)", () => {
    const started = performance.now();
    expect(parseTrayCode(`99U${"_".repeat(50_000)}`)).toBeNull();
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("accepts four-digit order numbers", () => {
    expect(parseTrayCode("99UXA01L10061")?.orderNumber).toBe("061");
    expect(parseTrayCode("99UXA01L100610")?.orderNumber).toBe("0610");
  });

  it("normalizes case and spaces", () => {
    expect(normalizeTrayCode(" 99uxa00l22036 ")).toBe("99UXA00L22036");
    expect(parseTrayCode("99uxa 00l22036")?.code).toBe("99UXA00L22036");
  });

  it("rejects text that is not a tray code", () => {
    for (const value of [
      "",
      "FIELD_TRAY",
      "CONTIGUOUS PANEL",
      "99XAT10W2005",
      "99UXA00L2092", // order number too short: a typo in the list
      "99UXA00L52036", // voltage level 5 does not exist
    ]) {
      expect(parseTrayCode(value)).toBeNull();
      expect(isTrayCode(value)).toBe(false);
    }
  });
});

describe("parseTraySize", () => {
  it("reads ladder and special tray sizes", () => {
    expect(parseTraySize("L600100300")).toEqual({
      widthMm: 600,
      flangeHeightMm: 100,
      bendRadiusMm: 300,
    });
    expect(parseTraySize("S 400 060 600")).toEqual({
      widthMm: 400,
      flangeHeightMm: 60,
      bendRadiusMm: 600,
    });
  });

  it("reads conduit and duct diameters", () => {
    expect(parseTraySize("C025")).toEqual({ diameterMm: 25 });
    expect(parseTraySize("d160")).toEqual({ diameterMm: 160 });
  });

  it("returns null for anything else", () => {
    expect(parseTraySize("U 600")).toBeNull();
    expect(parseTraySize("L600")).toBeNull();
  });
});

describe("labels", () => {
  it("has a Spanish label for every level and kind", () => {
    for (const level of CABLE_LEVELS) expect(CABLE_LEVEL_LABELS[level]).toBeTruthy();
    for (const kind of TRAY_KINDS) expect(TRAY_KIND_LABELS[kind]).toBeTruthy();
  });
});

describe("formatTraySize", () => {
  const none = { widthMm: null, flangeHeightMm: null, bendRadiusMm: null, diameterMm: null };

  it("describes trays, grids and conduits", () => {
    expect(formatTraySize({ ...none, widthMm: 600, flangeHeightMm: 100, bendRadiusMm: 300 })).toBe(
      "600 × 100 mm, radio 300 mm",
    );
    expect(formatTraySize({ ...none, widthMm: 300 })).toBe("300 mm de ancho");
    expect(formatTraySize({ ...none, diameterMm: 25 })).toBe("Ø 25 mm");
    expect(formatTraySize(none)).toBeNull();
  });
});

describe("parseTraySearch", () => {
  it("normalizes the code and ignores invalid values", () => {
    expect(parseTraySearch({ q: " 99uxa ", page: "2" })).toEqual({ q: "99UXA", page: 2 });
    expect(parseTraySearch({ q: ["99uxb", "x"], page: "0" })).toEqual({ q: "99UXB" });
    expect(parseTraySearch({ q: "x".repeat(60), page: "abc" })).toEqual({});
  });

  it("accepts only the page sizes on offer", () => {
    expect(parseTraySearch({ size: "120" })).toEqual({ size: 120 });
    expect(parseTraySearch({ size: "100000" })).toEqual({});
    expect(parseTraySearch({ size: "7" })).toEqual({});
  });
});

describe("trayQuery", () => {
  it("leaves out page 1 and the default size, and keeps the rest", () => {
    expect(trayQuery({})).toBe("");
    expect(trayQuery({ q: "99UXA", page: 1, size: 60 })).toBe("?q=99UXA");
    expect(trayQuery({ q: "99UXA", size: 120 }, { page: 3 })).toBe("?q=99UXA&page=3&size=120");
  });
});
