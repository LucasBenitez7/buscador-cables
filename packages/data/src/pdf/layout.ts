/**
 * Small geometry helpers to read a form-like page: find a label, then the value below it,
 * to its right or in a region. Positions are in PDF points from the top-left corner.
 */
import type { TextRun } from "./read-pdf";

export type Box = { x0: number; x1: number; top: number };

/** Runs on the same baseline (within `tolerance` points), left to right, top to bottom. */
export function lines(runs: readonly TextRun[], tolerance = 2.5): TextRun[][] {
  const result: TextRun[][] = [];
  for (const run of [...runs].sort((a, b) => a.top - b.top)) {
    const last = result.at(-1);
    if (last && Math.abs(last[0]!.top - run.top) < tolerance) {
      last.push(run);
    } else {
      result.push([run]);
    }
  }
  return result.map((line) => line.sort((a, b) => a.x0 - b.x0));
}

/** "Equipment ID:" → "EQUIPMENTID": labels are compared without spaces, ':' or '.'. */
export const compact = (text: string) => text.replace(/[\s:.]/g, "").toUpperCase();

/**
 * Finds a label made of one or more consecutive runs of a line ("CABLE ID" + ":").
 * `where` narrows the search to a part of the page.
 */
export function findLabel(
  runs: readonly TextRun[],
  label: string,
  where: (box: Box) => boolean = () => true,
): Box | null {
  const target = compact(label);
  for (const line of lines(runs)) {
    for (let start = 0; start < line.length; start += 1) {
      let joined = "";
      for (let end = start; end < Math.min(start + 6, line.length); end += 1) {
        joined += compact(line[end]!.text);
        if (joined === target) {
          const box = { x0: line[start]!.x0, x1: line[end]!.x1, top: line[start]!.top };
          if (where(box)) return box;
          break;
        }
        if (!target.startsWith(joined)) break;
      }
    }
  }
  return null;
}

const byReadingOrder = (a: TextRun, b: TextRun) =>
  Math.round(a.top) - Math.round(b.top) || a.x0 - b.x0;

const joinRuns = (runs: readonly TextRun[]) =>
  [...runs]
    .sort(byReadingOrder)
    .map((run) => run.text)
    .join(" ");

/**
 * The first line of text under a header that starts within its width (± `pad`). Starting,
 * not overlapping: a long value of the column to the left must not leak into this one.
 */
export function below(
  runs: readonly TextRun[],
  header: Box,
  { from = 3, to = 32, pad = 25 }: { from?: number; to?: number; pad?: number } = {},
): string | null {
  const candidates = runs.filter(
    (run) =>
      run.top > header.top + from &&
      run.top < header.top + to &&
      run.x0 > header.x0 - pad &&
      run.x0 < header.x1 + pad,
  );
  if (candidates.length === 0) return null;
  const first = Math.min(...candidates.map((run) => run.top));
  return joinRuns(candidates.filter((run) => Math.abs(run.top - first) < 2.5)) || null;
}

/** Text on the same line as a label, to its right and before `maxX`. */
export function rightOf(
  runs: readonly TextRun[],
  label: Box,
  maxX = Number.POSITIVE_INFINITY,
  tolerance = 2.5,
): string | null {
  const found = runs.filter(
    (run) => Math.abs(run.top - label.top) < tolerance && run.x0 > label.x1 + 1 && run.x0 < maxX,
  );
  return joinRuns(found) || null;
}

/** The lines of text inside a rectangle. */
export function region(
  runs: readonly TextRun[],
  {
    top,
    bottom,
    left = -1,
    right = Number.POSITIVE_INFINITY,
  }: {
    top: number;
    bottom: number;
    left?: number;
    right?: number;
  },
): string[] {
  const inside = runs.filter(
    (run) => run.top > top && run.top < bottom && run.x0 >= left && run.x0 < right,
  );
  return lines(inside).map((line) => line.map((run) => run.text).join(" "));
}

/** The runs inside a rectangle, top to bottom. */
export function runsIn(
  runs: readonly TextRun[],
  {
    top,
    bottom,
    left = -1,
    right = Number.POSITIVE_INFINITY,
  }: {
    top: number;
    bottom: number;
    left?: number;
    right?: number;
  },
): TextRun[] {
  return runs
    .filter((run) => run.top > top && run.top < bottom && run.x0 >= left && run.x0 < right)
    .sort(byReadingOrder);
}
