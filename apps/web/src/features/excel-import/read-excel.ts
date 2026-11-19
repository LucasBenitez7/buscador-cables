import {
  EXCEL_KINDS,
  EXCEL_LENGTH_SHEETS,
  EXCEL_SHEETS,
  excelDateFromFileName,
  readExcelLengths,
  readExcelStatus,
  type ExcelCell,
  type ExcelIgnoredRow,
  type ExcelKind,
  type ExcelLengths,
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

/**
 * Reads an Excel of the day in the browser: finds which of the two it is by its sheet, and
 * reads only the sheets it needs (the files have many). The server validates it all again.
 */
export async function readExcelFile(
  file: File,
  readSheet: SheetReader = readWithLibrary,
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
        const result = readExcelStatus(kind, table, lengths.lengths);
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
