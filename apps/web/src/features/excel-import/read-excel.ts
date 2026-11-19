import {
  EXCEL_KINDS,
  EXCEL_SHEETS,
  excelDateFromFileName,
  readExcelStatus,
  type ExcelCell,
  type ExcelIgnoredRow,
  type ExcelKind,
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

/**
 * Reads an Excel of the day in the browser: finds which of the two it is by its sheet, and
 * reads only that sheet (the files have many). The server validates it all again.
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
        const result = readExcelStatus(kind, table);
        if (!result.ok) {
          return {
            ok: false,
            message: `Faltan columnas en la hoja «${sheet}»: ${result.missingColumns.join(", ")}.`,
          };
        }
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
