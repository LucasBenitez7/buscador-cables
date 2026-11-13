/**
 * Extracts the project data from the PDFs: cable sheets from the cable lists and trays from
 * the routing drawings. Each page is recognised by its content, so the file names and the
 * order of the files do not matter.
 */
import { parseTrayCode, parseTraySize } from "@cables/shared";
import { parseCableSheet } from "../parse/cable-page";
import { parseDrawingSheet, type RawDrawingSheet } from "../parse/drawing-page";
import { readPdfPages } from "../pdf/read-pdf";
import { compareRevisions, normalizeCableSheet } from "./normalize";
import {
  projectCableSchema,
  projectTraySchema,
  type ExtractionIssue,
  type ExtractionResult,
  type ProjectCable,
  type ProjectTray,
} from "./schema";

export type SourcePdf = { name: string; data: Uint8Array };

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
  };

  for (const file of files) {
    const fileStats = { name: file.name, pages: 0, cableSheets: 0, drawingSheets: 0 };
    stats.files.push(fileStats);
    for await (const page of readPdfPages(file.data)) {
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
    const newer = compareRevisions(cable.revision, existing.revision) > 0;
    const same =
      JSON.stringify({ ...cable, sourcePage: 0, sourceFile: "", sourceDocument: "" }) ===
      JSON.stringify({ ...existing, sourcePage: 0, sourceFile: "", sourceDocument: "" });
    issues.push({
      severity: "warning",
      file: cable.sourceFile,
      page: cable.sourcePage,
      code: cable.code,
      message: same
        ? `Repetido e idéntico al de ${where(existing)}.`
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
  const trays = buildTrays(drawingSheets, cables, issues, stats);
  return { cables, trays, issues, stats };
}

function buildTrays(
  sheets: readonly DrawingSheetOf[],
  cables: readonly ProjectCable[],
  issues: ExtractionIssue[],
  stats: ExtractionResult["stats"],
): ProjectTray[] {
  // Sheet titles come from the index page of each drawing.
  const titles = new Map<string, string>();
  for (const sheet of sheets) {
    for (const entry of sheet.index) titles.set(`${sheet.drawing}#${entry.sheet}`, entry.title);
  }

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

  return [...trays.values()].filter((tray) => projectTraySchema.safeParse(tray).success);
}
