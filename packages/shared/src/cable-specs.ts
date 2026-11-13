/**
 * Reads what the cable type text of the project lists says about a cable:
 * "0,6/1 KV 8X2.5 MM2 CU" → 8 conductors of 2.5 mm², 0,6/1 kV.
 * "JE-Y(St)Y BD Si FR 4 x 2 x 0,8mm" → 4 pairs (8 conductors) of 0.8 mm diameter (≈ 0.5 mm²).
 * Anything it cannot read stays undefined: the text itself is kept as the cable type.
 */
export type CableSpec = {
  conductors?: number;
  crossSectionMm2?: number;
  voltageRating?: string;
};

const NUMBER = String.raw`(\d+(?:[.,]\d+)?)`;
const toNumber = (value: string) => Number(value.replace(",", "."));

/** Pairs, triples or quads: "4 x 2 x 0,8mm", "2 x 2 x 1,5 mm2", "1x2x1mm2". */
// The count may follow a word without a space ("Cable12x2x0.75mm2"), but not another number.
const GROUPS = new RegExp(
  String.raw`(?<![\d.,])(\d+)\s*x\s*(\d+)\s*x\s*${NUMBER}\s*(mm2|mm²|mm)\b`,
  "i",
);
/** Plain conductors: "8X2.5 MM2", "1X400MM2", "2 x 1,5 mm2". */
const CONDUCTORS = new RegExp(String.raw`(?<![\d.,])(\d+)\s*x\s*${NUMBER}\s*(?:mm2|mm²)`, "i");
/** "0,6/1 KV", "12/20KV". */
const VOLTAGE = new RegExp(String.raw`${NUMBER}\s*/\s*${NUMBER}\s*kv\b`, "i");

/** Cross-section of a round conductor of `diameter` mm, rounded to 2 decimals. */
function sectionOfDiameter(diameter: number) {
  return Math.round(((Math.PI * diameter * diameter) / 4) * 100) / 100;
}

export function parseCableSpec(text: string): CableSpec {
  const spec: CableSpec = {};

  const voltage = VOLTAGE.exec(text);
  if (voltage) {
    spec.voltageRating = `${voltage[1]}/${voltage[2]} kV`;
  }

  const groups = GROUPS.exec(text);
  if (groups) {
    const [, count, size, value, unit] = groups;
    spec.conductors = Number(count) * Number(size);
    const number = toNumber(value!);
    spec.crossSectionMm2 = unit!.toLowerCase() === "mm" ? sectionOfDiameter(number) : number;
    return spec;
  }

  const conductors = CONDUCTORS.exec(text);
  if (conductors) {
    spec.conductors = Number(conductors[1]);
    spec.crossSectionMm2 = toNumber(conductors[2]!);
  }
  return spec;
}
