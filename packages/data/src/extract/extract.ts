/**
 * Extracts the project data from the PDFs: cable sheets from the cable lists and trays from
 * the routing drawings. Each page is recognised by its content, so the file names and the
 * order of the files do not matter.
 */
import { parseTrayCode, parseTraySize } from "@cables/shared";
import { parseCableSheet } from "../parse/cable-page";
import { traySection } from "../parse/drawing-marks";
import { parseDrawingSheet, type RawDrawingSheet } from "../parse/drawing-page";
import { readPdfPages } from "../pdf/read-pdf";
import { compareRevisions, normalizeCableSheet } from "./normalize";
import {
  projectCableSchema,
  projectSheetSchema,
  projectTraySchema,
  type ExtractionIssue,
  type ExtractionResult,
  type ProjectCable,
  type ProjectSheet,
  type ProjectTray,
} from "./schema";

/** A PDF to read. `data` may be a function so big files are loaded one at a time. */
export type SourcePdf = { name: string; data: Uint8Array | (() => Promise<Uint8Array>) };

type DrawingSheetOf = RawDrawingSheet & { file: string };

export async function extractProjectData(
  files: readonly SourcePdf[],
  onProgress: (message: string) => void = () => {},
): Promise<ExtractionResult> {
  const issues: ExtractionIssue[] = [];
  const cablesByCode = new Map<string, ProjectCable>();
  const drawingSheets: DrawingSheetOf[] = [];
  const stats: ExtractionResult["stats"] = {
    files: [],
    cablesByLevel: {},
    traysInDrawings: 0,
    traysOnlyInRoutes: 0,
    trayMarks: { label: 0, flag: 0, tableOnly: 0 },
  };

  for (const file of files) {
    const fileStats = { name: file.name, pages: 0, cableSheets: 0, drawingSheets: 0 };
    stats.files.push(fileStats);
    const data = typeof file.data === "function" ? await file.data() : file.data;
    for await (const page of readPdfPages(data)) {
      fileStats.pages += 1;
      if (page.number % 250 === 0) onProgress(`${file.name}: página ${page.number}`);

      const raw = parseCableSheet(page);
      if (raw) {
        fileStats.cableSheets += 1;
        const { cable, code, issues: found } = normalizeCableSheet(raw, file.name);
        for (const issue of found) {
          issues.push({ ...issue, file: file.name, page: page.number, code });
        }
        if (cable) addCable(cable);
        continue;
      }
      const drawing = parseDrawingSheet(page);
      if (drawing.drawing) {
        fileStats.drawingSheets += 1;
        drawingSheets.push({ ...drawing, file: file.name });
      }
    }
    onProgress(`${file.name}: ${fileStats.pages} páginas leídas`);
  }

  /** The same cable twice: keep the higher revision, and say so. */
  function addCable(candidate: ProjectCable) {
    const parsed = projectCableSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({
          severity: "error",
          file: candidate.sourceFile,
          page: candidate.sourcePage,
          code: candidate.code,
          message: `${issue.path.join(".") || "ficha"}: ${issue.message}`,
        });
      }
      return;
    }
    const cable = parsed.data;
    const existing = cablesByCode.get(cable.code);
    if (!existing) {
      cablesByCode.set(cable.code, cable);
      return;
    }
    const where = (other: ProjectCable) => `${other.sourceFile} pág. ${other.sourcePage}`;
    const order = compareRevisions(cable.revision, existing.revision);
    const newer = order > 0;
    const same =
      JSON.stringify({ ...cable, sourcePage: 0, sourceFile: "", sourceDocument: "" }) ===
      JSON.stringify({ ...existing, sourcePage: 0, sourceFile: "", sourceDocument: "" });
    // Same revision, different data: nothing says which sheet is the good one.
    const tie = !same && order === 0;
    issues.push({
      severity: tie ? "error" : "warning",
      file: cable.sourceFile,
      page: cable.sourcePage,
      code: cable.code,
      message: same
        ? `Repetido e idéntico al de ${where(existing)}.`
        : tie
          ? `Repetido con la misma revisión (${cable.revision ?? "sin revisión"}) y datos distintos a los de ${where(existing)}: se conserva aquella ficha. Revisa cuál es la buena.`
          : newer
            ? `Repetido: se usa esta revisión (${cable.revision}) en lugar de la de ${where(existing)} (${existing.revision}).`
            : `Repetido: se usa la revisión de ${where(existing)} (${existing.revision}) y se descarta esta (${cable.revision}).`,
    });
    if (newer) cablesByCode.set(cable.code, cable);
  }

  const cables = [...cablesByCode.values()];
  for (const cable of cables) {
    stats.cablesByLevel[cable.level] = (stats.cablesByLevel[cable.level] ?? 0) + 1;
  }
  const sheets = buildSheets(drawingSheets);
  const trays = buildTrays(drawingSheets, cables, issues, stats);
  return { cables, trays, sheets, issues, stats };
}

/** Sheet titles come from the index page of each drawing. */
function sheetTitles(sheets: readonly DrawingSheetOf[]): Map<string, string> {
  const titles = new Map<string, string>();
  for (const sheet of sheets) {
    for (const entry of sheet.index) titles.set(`${sheet.drawing}#${entry.sheet}`, entry.title);
  }
  return titles;
}

/** One entry per drawing and sheet (the first page that has it). */
function buildSheets(sheets: readonly DrawingSheetOf[]): ProjectSheet[] {
  const titles = sheetTitles(sheets);
  const seen = new Set<string>();
  const result: ProjectSheet[] = [];
  for (const sheet of sheets) {
    const sheetNumber = sheet.sheet ?? "?";
    const key = `${sheet.drawing}#${sheetNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const parsed = projectSheetSchema.safeParse({
      drawing: sheet.drawing,
      sheet: sheetNumber,
      title: titles.get(key) ?? null,
      file: sheet.file,
      page: sheet.page,
      width: sheet.width,
      height: sheet.height,
      fingerprint: sheet.fingerprint,
    });
    if (parsed.success) result.push(parsed.data);
  }
  return result;
}

function buildTrays(
  sheets: readonly DrawingSheetOf[],
  cables: readonly ProjectCable[],
  issues: ExtractionIssue[],
  stats: ExtractionResult["stats"],
): ProjectTray[] {
  const titles = sheetTitles(sheets);

  const trays = new Map<string, ProjectTray>();
  const sizes = new Map<string, Map<string, number>>();
  const ensure = (code: string): ProjectTray | null => {
    const existing = trays.get(code);
    if (existing) return existing;
    const parsed = parseTrayCode(code);
    if (!parsed) return null;
    const tray: ProjectTray = {
      code: parsed.code,
      kind: parsed.kind,
      voltageLevel: parsed.voltageLevel,
      elevationLevel: parsed.elevationLevel,
      areaCode: parsed.areaCode,
      widthMm: null,
      flangeHeightMm: null,
      bendRadiusMm: null,
      diameterMm: null,
      drawings: [],
    };
    trays.set(code, tray);
    return tray;
  };

  for (const sheet of sheets) {
    for (const found of sheet.trays) {
      const tray = ensure(found.code);
      if (!tray) continue;
      const sheetNumber = sheet.sheet ?? "?";
      if (!tray.drawings.some((d) => d.drawing === sheet.drawing && d.sheet === sheetNumber)) {
        tray.drawings.push({
          drawing: sheet.drawing!,
          sheet: sheetNumber,
          title: titles.get(`${sheet.drawing}#${sheetNumber}`) ?? null,
          sourcePage: sheet.page,
          marks: [],
        });
      }
      if (found.size) {
        const counts = sizes.get(tray.code) ?? new Map<string, number>();
        counts.set(found.size, (counts.get(found.size) ?? 0) + 1);
        sizes.set(tray.code, counts);
      }
    }
  }
  stats.traysInDrawings = trays.size;
  locateTrays(sheets, trays, titles, stats);

  // The size printed most often wins; disagreements go to the report.
  for (const [code, counts] of sizes) {
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const size = parseTraySize(ranked[0]![0]);
    Object.assign(trays.get(code)!, size);
    if (ranked.length > 1) {
      issues.push({
        severity: "warning",
        file: "planos",
        page: null,
        code,
        message: `Tamaños distintos en los planos (${ranked.map(([value]) => value).join(", ")}): se usa ${ranked[0]![0]}.`,
      });
    }
  }

  // Trays that a route uses but no drawing names.
  for (const cable of cables) {
    for (const step of cable.route) {
      if (step.trayCode && !trays.has(step.trayCode)) {
        ensure(step.trayCode);
        stats.traysOnlyInRoutes += 1;
      }
    }
  }
  if (stats.traysOnlyInRoutes > 0) {
    issues.push({
      severity: "warning",
      file: "planos",
      page: null,
      code: null,
      message: `${stats.traysOnlyInRoutes} bandejas de los recorridos no aparecen en ningún plano: se crean sin plano.`,
    });
  }

  // A tray that does not pass the schema is left out, and the report says why.
  return [...trays.values()].filter((tray) => {
    const parsed = projectTraySchema.safeParse(tray);
    if (parsed.success) return true;
    for (const issue of parsed.error.issues) {
      issues.push({
        severity: "error",
        file: "planos",
        page: tray.drawings[0]?.sourcePage ?? null,
        code: tray.code,
        message: `Bandeja descartada: ${issue.path.join(".") || "bandeja"}: ${issue.message}`,
      });
    }
    return false;
  });
}

/**
 * Marks where each tray is on its sheets. A code drawn along the tray is the best mark. A tray
 * that only shows up in a table row (electrical drawings) is pointed at by the flag of its
 * section: on the same sheet if it has that flag, otherwise on the other sheets of the same
 * drawing that have it, except those whose own tables define that section (there the flag is
 * another floor's or level's). The table row stays as a mark of its own.
 */
function locateTrays(
  sheets: readonly DrawingSheetOf[],
  trays: Map<string, ProjectTray>,
  titles: Map<string, string>,
  stats: ExtractionResult["stats"],
) {
  const key = (drawing: string, sheet: string) => `${drawing}#${sheet}`;
  const byKey = new Map<string, DrawingSheetOf>();
  const byDrawing = new Map<string, DrawingSheetOf[]>();
  for (const sheet of sheets) {
    const sheetKey = key(sheet.drawing!, sheet.sheet ?? "?");
    if (byKey.has(sheetKey)) continue;
    byKey.set(sheetKey, sheet);
    byDrawing.set(sheet.drawing!, [...(byDrawing.get(sheet.drawing!) ?? []), sheet]);
  }

  const entryFor = (tray: ProjectTray, sheet: DrawingSheetOf) => {
    const sheetNumber = sheet.sheet ?? "?";
    let entry = tray.drawings.find((d) => d.drawing === sheet.drawing && d.sheet === sheetNumber);
    if (!entry) {
      entry = {
        drawing: sheet.drawing!,
        sheet: sheetNumber,
        title: titles.get(key(sheet.drawing!, sheetNumber)) ?? null,
        sourcePage: sheet.page,
        marks: [],
      };
      tray.drawings.push(entry);
    }
    return entry;
  };

  for (const sheet of byKey.values()) {
    for (const label of sheet.labels) {
      const tray = trays.get(label.code);
      if (!tray) continue;
      entryFor(tray, sheet).marks.push({
        x: label.x,
        y: label.y,
        w: label.w,
        h: label.h,
        kind: label.inTable ? "table" : "label",
      });
    }
  }

  const definesSection = (sheet: DrawingSheetOf, section: string) =>
    sheet.labels.some((label) => label.inTable && traySection(label.code) === section);
  const hasFlag = (sheet: DrawingSheetOf, section: string) =>
    sheet.flags.some((flag) => flag.section === section);

  for (const tray of trays.values()) {
    if (tray.drawings.some((entry) => entry.marks.some((mark) => mark.kind === "label"))) {
      stats.trayMarks.label += 1;
      continue;
    }
    const section = traySection(tray.code);
    let flagged = false;
    for (const entry of [...tray.drawings]) {
      if (!section || !entry.marks.some((mark) => mark.kind === "table")) continue;
      const own = byKey.get(key(entry.drawing, entry.sheet));
      if (!own) continue;
      const targets = hasFlag(own, section)
        ? [own]
        : (byDrawing.get(entry.drawing) ?? []).filter(
            (sheet) => sheet !== own && hasFlag(sheet, section) && !definesSection(sheet, section),
          );
      for (const target of targets) {
        const marks = entryFor(tray, target).marks;
        for (const flag of target.flags.filter((candidate) => candidate.section === section)) {
          marks.push({ x: flag.x, y: flag.y, w: flag.w, h: flag.h, kind: "flag" });
        }
        flagged = true;
      }
    }
    if (flagged) stats.trayMarks.flag += 1;
    else if (tray.drawings.length > 0) stats.trayMarks.tableOnly += 1;
  }
}
