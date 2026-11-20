import { describe, expect, it } from "vitest";
import { cableActionSchema } from "./cable-actions";
import { createCatalogItemSchema } from "./catalogs";
import { createLocationSchema } from "./locations";
import { createRoleSchema } from "./roles";
import { createSavedFolderSchema } from "./saved";
import { isCleanLine, isCleanText } from "./text";

const ch = (code: number) => String.fromCodePoint(code);

const NEWLINE = ch(0x0a);
const TAB = ch(0x09);
const ZERO_WIDTH_SPACE = ch(0x200b);
const ZERO_WIDTH_JOINER = ch(0x200d);
const RIGHT_TO_LEFT_OVERRIDE = ch(0x202e);

// Characters nobody sees: they make two names look the same or show a text backwards.
const HIDDEN_IN_LINE: [string, number][] = [
  ["line break", 0x0a],
  ["tab", 0x09],
  ["null byte", 0x00],
  ["zero-width space", 0x200b],
  ["right-to-left override", 0x202e],
  ["left-to-right isolate", 0x2066],
  ["byte order mark", 0xfeff],
];

describe("isCleanLine", () => {
  it("accepts ordinary text with accents and symbols", () => {
    expect(isCleanLine("Bandejas de la Unidad 2 (zona «A») ñ ü €")).toBe(true);
  });

  it.each(HIDDEN_IN_LINE)("rejects a %s", (_label, code) => {
    expect(isCleanLine(`a${ch(code)}b`)).toBe(false);
  });
});

describe("isCleanText", () => {
  it("accepts several lines, tabs and emoji joined with zero-width joiners", () => {
    const mechanic = `${ch(0x1f468)}${ZERO_WIDTH_JOINER}${ch(0x1f527)}`;

    expect(isCleanText(`Primera línea${NEWLINE}Segunda${TAB}con tab ${mechanic}`)).toBe(true);
  });

  it.each([0x00, 0x07, 0x7f, 0x202e, 0x2066, 0x200f])(
    "rejects control and direction characters (U+%s)",
    (code) => {
      expect(isCleanText(`a${ch(code)}b`)).toBe(false);
    },
  );
});

// The names that other people see: the same guard everywhere.
describe("names typed in the app", () => {
  it("reject invisible characters", () => {
    const name = `Pla${ZERO_WIDTH_SPACE}nta`;

    expect(
      createLocationSchema.safeParse({ name, code: "PL", type: "PLANT", parentId: null }).success,
    ).toBe(false);
    expect(createSavedFolderSchema.safeParse({ name }).success).toBe(false);
    expect(createRoleSchema.safeParse({ name, permissions: [] }).success).toBe(false);
    expect(createCatalogItemSchema.safeParse({ kind: "company", name, hex: "" }).success).toBe(
      false,
    );
  });

  it("still accept a normal name", () => {
    expect(createSavedFolderSchema.safeParse({ name: "Revisar el lunes" }).success).toBe(true);
    expect(createRoleSchema.safeParse({ name: "Jefe de obra", permissions: [] }).success).toBe(
      true,
    );
  });

  it("reject a note that shows backwards, but keep line breaks in notes", () => {
    const laid = (notes: string) =>
      cableActionSchema.safeParse({ cableId: "c1", version: "1", action: "LAID", notes });

    expect(laid(`Tendido ${RIGHT_TO_LEFT_OVERRIDE}odatelpmoc`).success).toBe(false);
    expect(laid(`Tendido.${NEWLINE}Falta peinar.`).success).toBe(true);
  });
});
