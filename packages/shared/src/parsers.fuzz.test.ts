import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { cableCodeSchema, normalizeCableCode } from "./cable-code";
import { parseCableSpec } from "./cable-specs";
import { normalizeTrayCode, parseTrayCode, parseTraySize } from "./trays";

/**
 * Property-based tests (fuzzing) of the parsers that read text typed by users or extracted
 * from the PDFs: whatever comes in, they must not throw, and what they accept must be stable.
 */

const digits = (length: number) =>
  fc
    .array(fc.constantFrom(..."0123456789"), { minLength: length, maxLength: length })
    .map((d) => d.join(""));
const letter = fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ");

describe("normalizeCableCode (fuzz)", () => {
  it("never throws and is idempotent", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const once = normalizeCableCode(input);
        expect(normalizeCableCode(once)).toBe(once);
      }),
    );
  });

  it("the schema never throws, and an accepted code is accepted again unchanged", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), (input) => {
        const result = cableCodeSchema.safeParse(input);
        if (result.success) {
          expect(cableCodeSchema.parse(result.data)).toBe(result.data);
        }
      }),
    );
  });
});

describe("parseTrayCode (fuzz)", () => {
  it("never throws, and a parsed code parses again to the same result", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), (input) => {
        const parsed = parseTrayCode(input);
        if (parsed) expect(parseTrayCode(parsed.code)).toEqual(parsed);
      }),
    );
  });

  it("reads every code built with the codification", () => {
    const code = fc.record({
      unit: digits(2),
      area: fc.tuple(letter, letter, letter).map((l) => l.join("")),
      subZone: digits(2),
      kind: fc.constantFrom("L", "W", "S", "C", "D", "T"),
      voltage: fc.integer({ min: 1, max: 4 }),
      elevation: fc.integer({ min: 0, max: 9 }),
      order: fc.oneof(digits(3), digits(4)),
    });
    fc.assert(
      fc.property(code, (c) => {
        const text = `${c.unit}${c.area}${c.subZone}${c.kind}${c.voltage}${c.elevation}${c.order}`;
        const parsed = parseTrayCode(` ${text.toLowerCase()} `);
        expect(parsed).toMatchObject({
          code: normalizeTrayCode(text),
          voltageLevel: c.voltage,
          elevationLevel: c.elevation,
          areaCode: `${c.unit}${c.area}`,
          orderNumber: c.order,
        });
      }),
    );
  });
});

describe("parseTraySize (fuzz)", () => {
  it("never throws on any text", () => {
    fc.assert(fc.property(fc.string({ maxLength: 30 }), (input) => void parseTraySize(input)));
  });

  it("reads back the width, flange and bend radius of a tray size code", () => {
    const mm = fc.integer({ min: 0, max: 999 });
    fc.assert(
      fc.property(fc.constantFrom("L", "S", "W"), mm, mm, mm, (kind, width, flange, radius) => {
        const pad = (n: number) => String(n).padStart(3, "0");
        expect(parseTraySize(`${kind}${pad(width)}${pad(flange)}${pad(radius)}`)).toEqual({
          widthMm: width,
          flangeHeightMm: flange,
          bendRadiusMm: radius,
        });
      }),
    );
  });
});

describe("parseCableSpec (fuzz)", () => {
  it("never throws, and what it reads is a positive number", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (input) => {
        const spec = parseCableSpec(input);
        if (spec.conductors !== undefined) expect(spec.conductors).toBeGreaterThanOrEqual(0);
        if (spec.crossSectionMm2 !== undefined)
          expect(Number.isFinite(spec.crossSectionMm2)).toBe(true);
      }),
    );
  });

  it("reads conductors and cross-section of a plain power cable type", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 99 }),
        fc.integer({ min: 1, max: 400 }),
        (count, section) => {
          expect(parseCableSpec(`0,6/1 KV ${count}X${section} MM2 CU`)).toEqual({
            conductors: count,
            crossSectionMm2: section,
            voltageRating: "0,6/1 kV",
          });
        },
      ),
    );
  });
});
