import { describe, expect, it } from "vitest";
import { drawingMarkRank, parseDrawingMarks, traySectionOf } from "./drawings";
import { cableSheetKey, isCableSheetKey } from "./drawings-storage";

describe("parseDrawingMarks", () => {
  it("keeps the valid marks and drops anything else", () => {
    expect(
      parseDrawingMarks([
        { x: 0.5, y: 0.25, kind: "flag" },
        { x: 2, y: 0.25, kind: "flag" },
        { x: 0.1, y: 0.1, kind: "arrow" },
        "nada",
      ]),
    ).toEqual([{ x: 0.5, y: 0.25, kind: "flag" }]);
    expect(parseDrawingMarks(null)).toEqual([]);
    expect(parseDrawingMarks({ x: 0.5 })).toEqual([]);
  });
});

describe("drawingMarkRank", () => {
  it("puts the drawn code first, then the flag, then the table row, then nothing", () => {
    const mark = (kind: "label" | "flag" | "table") => ({ x: 0, y: 0, kind });
    expect(drawingMarkRank([mark("table"), mark("label")])).toBe(0);
    expect(drawingMarkRank([mark("flag")])).toBe(1);
    expect(drawingMarkRank([mark("table")])).toBe(2);
    expect(drawingMarkRank([])).toBe(3);
  });
});

describe("traySectionOf", () => {
  it("takes the last three digits of the code", () => {
    expect(traySectionOf("99UXA00L21014")).toBe("014");
  });
});

describe("cableSheetKey", () => {
  it("is a safe file name, different for codes that differ only in '.', '/' or '-'", () => {
    const keys = ["99XAB10A1-W8001", "99X.A", "99X/A", "99X-A"].map(cableSheetKey);
    expect(keys).toEqual(["cable_99XAB10A1-W8001", "cable_99X_pA", "cable_99X_sA", "cable_99X-A"]);
    expect(keys.every((key) => /^[A-Za-z0-9_-]{1,120}$/.test(key) && isCableSheetKey(key))).toBe(
      true,
    );
    expect(isCableSheetKey("EJ-ELE-DRW-0024_02")).toBe(false);
  });
});
