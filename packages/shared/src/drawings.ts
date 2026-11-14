import { z } from "zod";

/**
 * Where a tray is on a sheet of the routing drawings (phase 7.5), as a fraction of the sheet
 * from its top-left corner, so it does not depend on the resolution of the image:
 * - "label": its code drawn along the tray (instrumentation drawings);
 * - "flag": the flag of its section on the plan (electrical drawings);
 * - "table": its row in a table of the sheet (the weakest: it says which section, not where).
 */
export const DRAWING_MARK_KINDS = ["label", "flag", "table"] as const;
export type DrawingMarkKind = (typeof DRAWING_MARK_KINDS)[number];

export const drawingMarkSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  kind: z.enum(DRAWING_MARK_KINDS),
  /** Size of the text marked, as a fraction of the sheet: a table row is framed whole. */
  w: z.number().min(0).max(1).optional(),
  h: z.number().min(0).max(1).optional(),
});
export type DrawingMark = z.infer<typeof drawingMarkSchema>;

/** Marks read from the database: anything malformed is dropped instead of breaking the page. */
export function parseDrawingMarks(value: unknown): DrawingMark[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = drawingMarkSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** How well a sheet shows where the tray is: the best sheets go first. */
export function drawingMarkRank(marks: readonly DrawingMark[]): number {
  if (marks.some((mark) => mark.kind === "label")) return 0;
  if (marks.some((mark) => mark.kind === "flag")) return 1;
  if (marks.some((mark) => mark.kind === "table")) return 2;
  return 3;
}

/** The section of a tray in the electrical drawings: the last three digits of its code. */
export const traySectionOf = (code: string): string => code.slice(-3);
