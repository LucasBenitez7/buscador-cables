/**
 * Reads one sheet of the routing drawings: its drawing number and sheet (title block), the
 * tray codes drawn on it with their size when the drawing gives it ("L600100300", "C025"),
 * and, on "SHEET INDEX" pages, the title of every sheet of the drawing.
 */
import { parseTrayCode, parseTraySize } from "@cables/shared";
import { findLabel } from "../pdf/layout";
import { sectionFlags, trayLabels, type SectionFlag, type TrayLabel } from "./drawing-marks";
import type { PdfPage, TextRun } from "../pdf/read-pdf";

export type RawDrawingTray = { code: string; size: string | null };

export type RawDrawingSheet = {
  page: number;
  drawing: string | null;
  sheet: string | null;
  /** Sheet titles listed on an index page: sheet number → title. */
  index: { sheet: string; title: string }[];
  trays: RawDrawingTray[];
  /** Size of the sheet in points. */
  width: number;
  height: number;
  labels: TrayLabel[];
  flags: SectionFlag[];
  /**
   * Changes when the text of the sheet changes, title block included (a new revision adds a
   * row): `data:render` only draws again the sheets whose fingerprint changed.
   */
  fingerprint: string;
};

const DRAWING_NUMBER = /^[A-Z0-9]+(?:-[A-Z0-9]+)*-DRW-\d{4}$/;
/** "02", "2", "SH17" → "02", "02", "17". */
const SHEET = /^(?:SH)?(\d{1,3})$/;
export const normalizeSheet = (value: string) => {
  const match = SHEET.exec(value.trim().toUpperCase());
  return match ? match[1]!.padStart(2, "0") : null;
};
const SIZE_GAP = 150;

/** The drawing number of the title block: the bottom-rightmost one on the sheet. */
function drawingNumber(runs: readonly TextRun[]): string | null {
  const candidates = runs.filter((run) => DRAWING_NUMBER.test(run.text));
  candidates.sort((a, b) => b.top + b.x0 - (a.top + a.x0));
  return candidates[0]?.text ?? null;
}

function sheetNumber(runs: readonly TextRun[]): string | null {
  // Label and value in one run ("Blatt: 02") or in two.
  for (const run of runs) {
    const match = /^Blatt:\s*(\S+)$/i.exec(run.text);
    if (match && normalizeSheet(match[1]!)) return normalizeSheet(match[1]!);
  }
  const label = findLabel(runs, "Blatt:");
  if (!label) return null;
  const value = runs
    .filter(
      (run) => Math.abs(run.top - label.top) < 5 && run.x0 > label.x0 && run.x0 < label.x1 + 80,
    )
    .find((run) => normalizeSheet(run.text) !== null);
  return value ? normalizeSheet(value.text) : null;
}

function sheetIndex({ runs, height }: PdfPage): { sheet: string; title: string }[] {
  const header = findLabel(runs, "SHEET INDEX", (box) => box.top < height * 0.5);
  if (!header) return [];
  const numbers = runs.filter(
    (run) => /^\d{1,2}$/.test(run.text) && run.top > header.top && run.top < height * 0.9,
  );
  // The sheet numbers are a column: keep the ones aligned with the most common x.
  const columns = new Map<number, TextRun[]>();
  for (const run of numbers) {
    const x = Math.round(run.x0 / 10);
    columns.set(x, [...(columns.get(x) ?? []), run]);
  }
  const column = [...columns.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  const entries: { sheet: string; title: string }[] = [];
  for (const number of column) {
    const title = runs
      .filter(
        (run) => Math.abs(run.top - number.top) < 3 && run.x0 > number.x1 && run.text.length > 10,
      )
      .sort((a, b) => a.x0 - b.x0)[0];
    if (title) {
      entries.push({ sheet: normalizeSheet(number.text)!, title: cleanTitle(title.text) });
    }
  }
  return entries;
}

/** "INSTRUMENTS LAY OUT & CABLE TRAY CODIFICATION DRAWING - AREA 2.1 …" → "AREA 2.1 …". */
function cleanTitle(text: string): string {
  return text.replace(/^.*?DRAWINGS?\s+-\s+/i, "").trim();
}

function traysOn(runs: readonly TextRun[]): RawDrawingTray[] {
  const trays: RawDrawingTray[] = [];
  for (const run of runs) {
    const tokens = run.text.split(" ");
    tokens.forEach((token, index) => {
      if (!parseTrayCode(token)) return;
      const inRun = tokens[index + 1];
      let size = inRun && parseTraySize(inRun) ? inRun : null;
      if (!size) {
        const next = runs
          .filter(
            (other) =>
              Math.abs(other.top - run.top) < 3 &&
              other.x0 >= run.x1 - 1 &&
              other.x0 - run.x1 < SIZE_GAP,
          )
          .sort((a, b) => a.x0 - b.x0)[0];
        const first = next?.text.split(" ")[0];
        size = first && parseTraySize(first) ? first : null;
      }
      trays.push({ code: token, size });
    });
  }
  return trays;
}

export function parseDrawingSheet(page: PdfPage): RawDrawingSheet {
  return {
    page: page.number,
    drawing: drawingNumber(page.runs),
    sheet: sheetNumber(page.runs),
    index: sheetIndex(page),
    trays: traysOn(page.runs),
    width: Math.round(page.width),
    height: Math.round(page.height),
    labels: trayLabels(page),
    flags: sectionFlags(page),
    fingerprint: page.fingerprint,
  };
}
