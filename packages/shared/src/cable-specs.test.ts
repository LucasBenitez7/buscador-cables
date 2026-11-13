import { describe, expect, it } from "vitest";
import { parseCableSpec } from "./cable-specs";

describe("parseCableSpec", () => {
  it("reads low and medium voltage power and control cables", () => {
    expect(parseCableSpec("0,6/1 KV 8X2.5 MM2 CU")).toEqual({
      conductors: 8,
      crossSectionMm2: 2.5,
      voltageRating: "0,6/1 kV",
    });
    expect(parseCableSpec("0,6/1 KV 3X2,5MM2 CU")).toMatchObject({
      conductors: 3,
      crossSectionMm2: 2.5,
    });
    expect(parseCableSpec("12/20KV 1X400MM2 CU")).toEqual({
      conductors: 1,
      crossSectionMm2: 400,
      voltageRating: "12/20 kV",
    });
  });

  it("reads instrumentation pairs given by section", () => {
    expect(parseCableSpec("AgL LiSi(St)Si 2 x 2 x 1,5 mm2+S")).toEqual({
      conductors: 4,
      crossSectionMm2: 1.5,
    });
    expect(parseCableSpec("Cable12x2x0.75mm2 BK/WH")).toEqual({
      conductors: 24,
      crossSectionMm2: 0.75,
    });
    expect(parseCableSpec("R-PVC IS/OS 1x2x1mm2")).toEqual({
      conductors: 2,
      crossSectionMm2: 1,
    });
  });

  it("turns a conductor diameter into its cross-section", () => {
    expect(parseCableSpec("JE-Y(St)Y BD Si FR 4 x 2 x 0,8mm")).toEqual({
      conductors: 8,
      crossSectionMm2: 0.5,
    });
  });

  it("reads plain conductors written with spaces", () => {
    expect(parseCableSpec("N2XCY 2 x 1,5 mm2")).toEqual({ conductors: 2, crossSectionMm2: 1.5 });
  });

  it("leaves out what it cannot read", () => {
    expect(parseCableSpec("Coaxial Cable")).toEqual({});
    expect(parseCableSpec("LSZH CAT. 7 S/FTP LAN 4x(2x23AWG+S)+S")).toEqual({});
    expect(parseCableSpec("Fiber Optic Singlemode; 01x09/125 µm; Patchcord LC")).toEqual({});
  });
});
