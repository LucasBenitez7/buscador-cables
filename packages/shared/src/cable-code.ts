import { z } from "zod";

/**
 * Normalizes a cable code so that different spellings map to the same value.
 *
 * Examples: "sh50", "SH 50", " sh_50 ", "Sh-50" -> "SH-50".
 * A hyphen is inserted between a leading letter group and a following digit group.
 */
export function normalizeCableCode(input: string): string {
  const compact = input
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return compact.replace(/^([A-Z]+)(\d)/, "$1-$2");
}

export const cableCodeSchema = z
  .string()
  .trim()
  .min(1, "El código es obligatorio")
  .max(50, "El código no puede superar 50 caracteres")
  .transform(normalizeCableCode)
  .pipe(
    z
      .string()
      .regex(
        /^[A-Z0-9][A-Z0-9.\-/]*$/,
        "El código solo puede contener letras, números, '-', '.' y '/'",
      ),
  );
