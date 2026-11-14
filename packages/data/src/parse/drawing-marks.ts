/**
 * Where each tray is drawn on a sheet of the routing drawings.
 *
 * Two kinds of drawing (see docs/DATOS-PROYECTO.md → "Planos"):
 * - Instrumentation: the tray code is written along the tray. That text is the mark.
 * - Electrical: the plan carries flags with a section number ("015") and tables list the trays
 *   of each section. The code shows up only in a table row; the flag is found later, across
 *   the sheets of the same drawing (see `locateTrays` in extract).
 *
 * Positions are fractions of the sheet (0 to 1 from the top-left corner), so they do not depend
 * on the resolution the sheet is rendered at.
 */
import { parseTrayCode } from "@cables/shared";
import type { PdfPage, TextRun } from "../pdf/read-pdf";

/** A tray code written on the sheet: along the tray, or in a table row. */
export type TrayLabel = { code: string; x: number; y: number; inTable: boolean };

/** A section flag on the plan ("015"). */
export type SectionFlag = { section: string; x: number; y: number };

const SECTION = /^\d{3}$/;
/** Margin with the frame and its grid numbers, as a fraction of the sheet. */
const MARGIN = 0.03;
/** A table label sits at most this far to the left of the codes of its rows (points). */
const TABLE_LABEL_GAP = 150;
const TABLE_LABEL_SPAN = 80;

const round = (value: number) => Math.round(value * 10_000) / 10_000;

/** Every tray code token with its centre (a run may hold a code and its size). */
function codeTokens(runs: readonly TextRun[]) {
  const tokens: { code: string; run: TextRun; cx: number; cy: number }[] = [];
  for (const run of runs) {
    const parts = run.text.split(" ");
    let offset = 0;
    for (const part of parts) {
      const parsed = parseTrayCode(part);
      if (parsed) {
        // Centre of the token along the run, in proportion to its characters.
        const share = (offset + part.length / 2) / run.text.length - 0.5;
        const length = run.x1 - run.x0;
        const radians = (run.angle * Math.PI) / 180;
        tokens.push({
          code: parsed.code,
          run,
          cx: run.cx + share * length * Math.cos(radians),
          cy: run.cy - share * length * Math.sin(radians),
        });
      }
      offset += part.length + 1;
    }
  }
  return tokens;
}

/**
 * A code in a table: horizontal, and with another code right above or below it in the same
 * column, or a section number just to its left on its line (a one-row table). Codes written
 * along the trays are scattered, often rotated.
 */
function isInTable(
  token: { run: TextRun },
  all: readonly { run: TextRun }[],
  runs: readonly TextRun[],
): boolean {
  const { run } = token;
  if (run.angle !== 0) return false;
  const stacked = all.some(
    (other) =>
      other.run !== run &&
      other.run.angle === 0 &&
      Math.abs(other.run.x0 - run.x0) < 3 &&
      Math.abs(other.run.top - run.top) < run.size * 2.5,
  );
  return (
    stacked ||
    runs.some(
      (other) =>
        SECTION.test(other.text) &&
        other.x1 < run.x0 &&
        run.x0 - other.x1 < TABLE_LABEL_GAP &&
        Math.abs(other.top - run.top) < run.size,
    )
  );
}

export function trayLabels(page: PdfPage): TrayLabel[] {
  const tokens = codeTokens(page.runs);
  return tokens.map((token) => ({
    code: token.code,
    x: round(token.cx / page.width),
    y: round(token.cy / page.height),
    inTable: isInTable(token, tokens, page.runs),
  }));
}

/**
 * Section numbers drawn on the plan: three digits, horizontal, away from the frame, and not the
 * first column of a table (a number with tray codes just to its right).
 */
export function sectionFlags(page: PdfPage): SectionFlag[] {
  const codes = codeTokens(page.runs);
  return page.runs
    .filter((run) => SECTION.test(run.text) && run.angle === 0)
    .filter(
      (run) =>
        run.cx > page.width * MARGIN &&
        run.cx < page.width * (1 - MARGIN) &&
        run.cy > page.height * MARGIN &&
        run.cy < page.height * (1 - MARGIN),
    )
    .filter(
      (run) =>
        !codes.some(
          (code) =>
            code.run.x0 > run.x1 &&
            code.run.x0 - run.x1 < TABLE_LABEL_GAP &&
            Math.abs(code.run.top - run.top) < TABLE_LABEL_SPAN,
        ),
    )
    .map((run) => ({
      section: run.text,
      x: round(run.cx / page.width),
      y: round(run.cy / page.height),
    }));
}

/** The section of a tray: the last three digits of its code ("80UBA00L21014" → "014"). */
export const traySection = (code: string): string | null =>
  parseTrayCode(code)?.orderNumber.slice(-3) ?? null;
