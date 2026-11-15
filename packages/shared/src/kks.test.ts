import { describe, expect, it } from "vitest";
import { parseBuildingCode, parseRoomCode } from "./kks";

describe("parseRoomCode", () => {
  it("splits a room code into unit, building group, building and room", () => {
    expect(parseRoomCode(" 99uxa16ra001 ")).toEqual({
      code: "99UXA16RA001",
      unit: "99",
      groupCode: "99UX",
      buildingCode: "99UXA",
      room: "16RA001",
    });
  });

  it("accepts one-digit floors", () => {
    expect(parseRoomCode("99UYC9RA015")?.room).toBe("9RA015");
  });

  it("rejects what is not a room", () => {
    for (const value of ["", "---", "99UXA", "OTHER7", "PENDING", "99XAB10CT001", "99UXA16RA01"]) {
      expect(parseRoomCode(value)).toBeNull();
    }
  });
});

describe("parseBuildingCode", () => {
  it("splits a building code and rejects anything else", () => {
    expect(parseBuildingCode("99UXA")).toEqual({
      unit: "99",
      groupCode: "99UX",
      buildingCode: "99UXA",
    });
    expect(parseBuildingCode("99UX")).toBeNull();
    expect(parseBuildingCode("99XAB")).toBeNull();
    expect(parseBuildingCode("99UXA16RA001")).toBeNull();
  });
});
