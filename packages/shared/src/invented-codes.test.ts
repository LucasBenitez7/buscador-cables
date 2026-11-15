import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseBuildingCode, parseRoomCode } from "./kks";
import { parseTrayCode } from "./trays";

/**
 * Regla 11 de AGENTS.md: los ejemplos usan la unidad inventada "99". Los códigos reales del
 * cliente (otra unidad) no pueden llegar al repositorio público, ni en el código, ni en los
 * tests, ni en la documentación. Revisión F7.5, A1.
 */

const INVENTED_UNIT = "99";
const REPO = path.resolve(import.meta.dirname, "..", "..", "..");
const BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|zip)$/i;
// Generados o de terceros: no los escribe nadie del proyecto.
const SKIPPED = new Set(["pnpm-lock.yaml"]);

/** Codes with the shape of the project codification: trays, rooms, systems and equipment. */
const SYSTEM_OR_EQUIPMENT = /^\+?\d{2}[A-Z]{3}\d{2,3}(?:[A-Z]{1,2}\d{3,4})?$/;
const BUILDING_GROUP = /^\d{2}U[A-Z]$/;

function kksUnit(token: string): string | null {
  const isKks =
    parseTrayCode(token) !== null ||
    parseRoomCode(token) !== null ||
    parseBuildingCode(token) !== null ||
    BUILDING_GROUP.test(token) ||
    SYSTEM_OR_EQUIPMENT.test(token);
  return isKks ? token.replace(/^\+/, "").slice(0, 2) : null;
}

/** Every KKS-shaped code in a text whose unit is not the invented one. */
function realLookingCodes(text: string): string[] {
  const tokens = text.match(/(?<![A-Za-z0-9_#-])\+?\d{2}[A-Za-z][A-Za-z0-9_]*/g) ?? [];
  return tokens.filter((token) => {
    const unit = kksUnit(token.toUpperCase());
    return unit !== null && unit !== INVENTED_UNIT;
  });
}

function versionedFiles(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: REPO, encoding: "utf8" })
    .split("\0")
    .filter((file) => file && !BINARY.test(file) && !SKIPPED.has(path.basename(file)));
}

describe("realLookingCodes", () => {
  // Otra unidad, montada aquí para que este fichero no se marque a sí mismo.
  const other = (code: string) => code.replace("99", "41");

  it("finds trays, rooms, buildings, systems and equipment of another unit", () => {
    const codes = [
      "99UXA00L21014",
      "99UXA16RA001",
      "99UX",
      "99UXA",
      "+99BMA01",
      "+99BMA011",
      "99XAT10W2005",
    ].map(other);

    expect(realLookingCodes(`${codes.join(", ")} y /${other("99")}/${codes[2]}`)).toEqual([
      ...codes,
      codes[2],
    ]);
  });

  it("accepts the invented unit and ignores what only looks like a code", () => {
    expect(
      realLookingCodes(
        "99UXA00L22036 +99bma01 99UX_01L10002 bg-background/80 #80ABCD 2x2,5 10mm 24h EJ-ELE-DRW-0024_02",
      ),
    ).toEqual([]);
  });
});

describe("versioned files", () => {
  it("only use the invented unit in their examples", () => {
    const found = versionedFiles().flatMap((file) => {
      const text = readFileSync(path.join(REPO, file), "utf8");
      return realLookingCodes(text).map((code) => `${file}: ${code}`);
    });

    expect(found).toEqual([]);
  });
});
