import { describe, expect, it } from "vitest";
import { cableCodeSchema, normalizeCableCode } from "./cable-code";

describe("normalizeCableCode", () => {
  it.each([
    ["SH-50", "SH-50"],
    ["sh-50", "SH-50"],
    ["sh50", "SH-50"],
    ["SH 50", "SH-50"],
    [" sh_50 ", "SH-50"],
    ["sh--50", "SH-50"],
    ["TR-12-A", "TR-12-A"],
    ["12-AB", "12-AB"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeCableCode(input)).toBe(expected);
  });
});

describe("cableCodeSchema", () => {
  it("returns the normalized code", () => {
    expect(cableCodeSchema.parse("sh50")).toBe("SH-50");
  });

  it("rejects empty codes", () => {
    expect(cableCodeSchema.safeParse("   ").success).toBe(false);
  });

  it("rejects invalid characters", () => {
    expect(cableCodeSchema.safeParse("SH#50").success).toBe(false);
  });
});
