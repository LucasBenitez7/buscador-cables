import { describe, expect, it } from "vitest";
import { drawingMarkRank, parseDrawingMarks, traySectionOf } from "./drawings";

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
