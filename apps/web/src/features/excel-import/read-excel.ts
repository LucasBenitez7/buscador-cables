import {
  EXCEL_KINDS,
  EXCEL_LENGTH_SHEETS,
  EXCEL_PLANNED_REEL_SHEETS,
  EXCEL_SHEETS,
  excelDateFromFileName,
  findPlannedReelSheet,
  readExcelLengths,
  readExcelPlannedReels,
  readExcelStatus,
  type ExcelCell,
  type ExcelIgnoredRow,
  type ExcelKind,
  type ExcelLengths,
  type ExcelPlannedReels,
  type ExcelStatusRow,
} from "@cables/shared";

export type ReadExcelResult =
  | {
      ok: true;
      kind: ExcelKind;
      rows: ExcelStatusRow[];
      ignored: ExcelIgnoredRow[];
      /** From the name of the file, "YYYY-MM-DD"; null when it does not carry one. */
      excelDate: string | null;
    }
  | { ok: false; message: string };

/** Reads one sheet of the file; null when the file has no sheet with that name. */
export type SheetReader = (file: File, sheet: string) => Promise<ExcelCell[][] | null>;

/** The names of all the sheets of the file. */
export type SheetNamesReader = (file: File) => Promise<string[]>;

/** The library is loaded only when somebody picks a file: it is not in the page's bundle. */
const readWithLibrary: SheetReader = async (file, sheet) => {
  const { readSheet, SheetNotFoundError } = await import("read-excel-file/browser");
  try {
    return (await readSheet(file, sheet)) as ExcelCell[][];
  } catch (error) {
    if (error instanceof SheetNotFoundError) return null;
    throw error;
  }
};

/** Excel never lets a sheet name have a colon. */
const NO_SHEET = ":";

/**
 * The library has no call that only lists the sheets: asking for one that cannot exist fails
 * with the list of the ones there are (`sheets`, documented but not typed), reading none.
 */
const sheetNamesWithLibrary: SheetNamesReader = async (file) => {
  const { readSheet, SheetNotFoundError } = await import("read-excel-file/browser");
  try {
    await readSheet(file, NO_SHEET);
  } catch (error) {
    const sheets: unknown =
      error instanceof SheetNotFoundError ? Reflect.get(error, "sheets") : null;
    if (Array.isArray(sheets)) return sheets.filter((name) => typeof name === "string");
    throw error;
  }
  return [];
};

const missing = (sheet: string, columns: readonly string[]) => ({
  ok: false as const,
  message: `Faltan columnas en la hoja «${sheet}»: ${columns.join(", ")}.`,
});

/** The real metres of a kind that keeps them in another sheet; a message when they cannot be read. */
async function readLengths(
  file: File,
  kind: ExcelKind,
  readSheet: SheetReader,
): Promise<{ ok: true; lengths?: ExcelLengths } | { ok: false; message: string }> {
  const spec = EXCEL_LENGTH_SHEETS[kind];
  if (!spec) return { ok: true };
  for (const sheet of spec.sheetNames) {
    const table = await readSheet(file, sheet);
    if (!table) continue;
    const result = readExcelLengths(kind, table);
    if (!result.ok) return missing(sheet, result.missingColumns);
    return { ok: true, lengths: result.lengths };
  }
  return {
    ok: false,
    message: `El Excel no tiene la hoja «${spec.sheetNames[0]}» con los metros tendidos.`,
  };
}

/** The planned reels of a kind that keeps them in its total table; a message when they cannot be read. */
async function readPlannedReels(
  file: File,
  kind: ExcelKind,
  readSheet: SheetReader,
  readSheetNames: SheetNamesReader,
): Promise<{ ok: true; plannedReels?: ExcelPlannedReels } | { ok: false; message: string }> {
  const spec = EXCEL_PLANNED_REEL_SHEETS[kind];
  if (!spec) return { ok: true };
  const sheet = findPlannedReelSheet(kind, await readSheetNames(file));
  const table = sheet === null ? null : await readSheet(file, sheet);
  if (sheet === null || !table) {
    return { ok: false, message: `El Excel no tiene la hoja ${spec.description}.` };
  }
  const result = readExcelPlannedReels(kind, table);
  if (!result.ok) return missing(sheet, result.missingColumns);
  return { ok: true, plannedReels: result.plannedReels };
}

/**
 * Reads an Excel of the day in the browser: finds which of the two it is by its sheet, and
 * reads only the sheets it needs (the files have many). The server validates it all again.
 */
export async function readExcelFile(
  file: File,
  readSheet: SheetReader = readWithLibrary,
  readSheetNames: SheetNamesReader = sheetNamesWithLibrary,
): Promise<ReadExcelResult> {
  try {
    for (const kind of EXCEL_KINDS) {
      for (const sheet of EXCEL_SHEETS[kind].sheetNames) {
        const table = await readSheet(file, sheet);
        if (!table) continue;
        // The columns of the main sheet first: its header alone says what is missing.
        const columns = readExcelStatus(kind, table.slice(0, 1));
        if (!columns.ok) return missing(sheet, columns.missingColumns);
        const lengths = await readLengths(file, kind, readSheet);
        if (!lengths.ok) return lengths;
        const planned = await readPlannedReels(file, kind, readSheet, readSheetNames);
        if (!planned.ok) return planned;
        const result = readExcelStatus(kind, table, {
          lengths: lengths.lengths,
          plannedReels: planned.plannedReels,
        });
        if (!result.ok) return missing(sheet, result.missingColumns);
        return {
          ok: true,
          kind,
          rows: result.rows,
          ignored: result.ignored,
          excelDate: excelDateFromFileName(file.name),
        };
      }
    }
  } catch {
    return { ok: false, message: "No se pudo leer el archivo. Comprueba que es un Excel (.xlsx)." };
  }
  const names = EXCEL_KINDS.map((kind) => `«${EXCEL_SHEETS[kind].sheetNames[0]}»`).join(" o ");
  return { ok: false, message: `El Excel no tiene la hoja ${names}.` };
}
