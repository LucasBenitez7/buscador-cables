import "server-only";
import { prisma } from "@cables/db";
import {
  parseDrawingMarks,
  routeProgress,
  type CableEndSide,
  type DrawingMark,
  type InstallationStatus,
} from "@cables/shared";
import { hasDrawingImage } from "./store";

/** A tray of the route on a sheet: its step number and how far the cable got there. */
export type RouteSheetMark = DrawingMark & {
  label: string;
  tone: "success" | "muted" | "warning";
};

/** A sheet of the drawings with the trays of a cable's route marked on it. */
export type RouteSheet = {
  key: string;
  drawing: string;
  sheet: string;
  title: string | null;
  width: number;
  height: number;
  /** Where the loose end waits first, then the rest in route order. */
  marks: RouteSheetMark[];
  /** How many trays of the route the sheet shows. */
  trays: number;
  /** Whether the tray where the loose end waits is on this sheet. */
  hasLooseEnd: boolean;
};

type Route = readonly { trayCode: string | null }[];
type RouteState = {
  installationStatus: InstallationStatus;
  looseEnd: CableEndSide | null;
  looseEndTray: string | null;
};

export type SheetRow = {
  trayCode: string;
  marks: unknown;
  sheet: {
    key: string;
    drawing: string;
    sheet: string;
    title: string | null;
    width: number;
    height: number;
  };
};

const TONE_RANK: Record<RouteSheetMark["tone"], number> = { warning: 0, success: 1, muted: 2 };

/**
 * Pure: groups the marks of the route trays by sheet. Only marks that show where a tray is
 * (its drawn code, its section flag) count; table rows do not. Trays that share a flag (a
 * section with several levels) share one mark, labelled with all their step numbers.
 */
export function buildRouteSheets(
  rows: readonly SheetRow[],
  route: Route,
  state: RouteState,
): RouteSheet[] {
  const { steps } = routeProgress(route, state);
  const stepsOf = new Map<string, number[]>();
  route.forEach((step, index) => {
    if (step.trayCode) stepsOf.set(step.trayCode, [...(stepsOf.get(step.trayCode) ?? []), index]);
  });

  const sheets = new Map<string, RouteSheet & { points: Map<string, RouteSheetMark> }>();
  for (const row of rows) {
    const marks = parseDrawingMarks(row.marks).filter((mark) => mark.kind !== "table");
    if (marks.length === 0) continue;
    const indexes = stepsOf.get(row.trayCode) ?? [];
    const isLoose = state.looseEndTray === row.trayCode;
    const tone: RouteSheetMark["tone"] = isLoose
      ? "warning"
      : indexes.some((index) => steps[index] === "laid")
        ? "success"
        : "muted";
    const label =
      indexes.length > 0
        ? indexes.map((index) => String(index + 1)).join(", ")
        : // Fuera del recorrido previsto: solo puede ser la bandeja donde lo encontraron.
          "Aquí";

    let sheet = sheets.get(row.sheet.key);
    if (!sheet) {
      sheet = { ...row.sheet, marks: [], trays: 0, hasLooseEnd: false, points: new Map() };
      sheets.set(row.sheet.key, sheet);
    }
    sheet.trays += 1;
    sheet.hasLooseEnd ||= isLoose;
    for (const mark of marks) {
      const point = `${mark.x}:${mark.y}`;
      const existing = sheet.points.get(point);
      if (!existing) {
        sheet.points.set(point, { ...mark, label, tone });
        continue;
      }
      existing.label = [...new Set([...existing.label.split(", "), ...label.split(", ")])]
        .sort((a, b) => Number(a) - Number(b))
        .join(", ");
      if (TONE_RANK[tone] < TONE_RANK[existing.tone]) existing.tone = tone;
    }
  }

  const firstStep = (mark: RouteSheetMark) => Number(mark.label.split(", ")[0]) || 0;
  const looseFirst = (mark: RouteSheetMark) => (mark.tone === "warning" ? 0 : 1);
  return [...sheets.values()]
    .map(({ points, ...sheet }) => ({
      ...sheet,
      marks: [...points.values()].sort(
        (a, b) => looseFirst(a) - looseFirst(b) || firstStep(a) - firstStep(b),
      ),
    }))
    .sort(
      (a, b) =>
        Number(b.hasLooseEnd) - Number(a.hasLooseEnd) ||
        b.trays - a.trays ||
        a.drawing.localeCompare(b.drawing) ||
        a.sheet.localeCompare(b.sheet),
    );
}

/** The sheets that show the trays of a cable's route, with their images drawn. */
export async function getRouteSheets(route: Route, state: RouteState): Promise<RouteSheet[]> {
  const codes = [
    ...new Set(
      [...route.map((step) => step.trayCode), state.looseEndTray].filter(
        (code): code is string => code !== null,
      ),
    ),
  ];
  if (codes.length === 0) return [];
  const rows = await prisma.trayDrawing.findMany({
    where: { tray: { code: { in: codes } }, drawingSheet: { isNot: null } },
    select: {
      marks: true,
      tray: { select: { code: true } },
      drawingSheet: {
        select: {
          imageKey: true,
          drawing: true,
          sheet: true,
          title: true,
          width: true,
          height: true,
        },
      },
    },
  });
  const drawn = new Set<string>();
  for (const key of new Set(rows.map((row) => row.drawingSheet!.imageKey))) {
    if (await hasDrawingImage(key)) drawn.add(key);
  }
  return buildRouteSheets(
    rows
      .filter((row) => drawn.has(row.drawingSheet!.imageKey))
      .map((row) => {
        const { imageKey, ...sheet } = row.drawingSheet!;
        return { trayCode: row.tray.code, marks: row.marks, sheet: { key: imageKey, ...sheet } };
      }),
    route,
    state,
  );
}
