import {
  EXCEL_KINDS,
  EXCEL_LENGTH_SHEETS,
  EXCEL_PLANNED_REEL_SHEETS,
  EXCEL_REEL_PULL_SHEETS,
  EXCEL_REEL_SHEETS,
  EXCEL_SHEETS,
  excelDateFromFileName,
  findPlannedReelSheet,
  normalizeHeader,
  readExcelLengths,
  readExcelPlannedReels,
  readExcelReelPulls,
  readExcelReels,
  readExcelStatus,
  reelSheetMessage,
  type ExcelCell,
  type ExcelIgnoredRow,
  type ExcelKind,
  type ExcelLengths,
  type ExcelPlannedReels,
  type ExcelReel,
  type ExcelReelPull,
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
      /** Its reels (fase 18); null when it has neither of their sheets. */
      reels: ExcelReel[] | null;
      /** The pullings of its reels; null when it has no sheet of them. */
      reelPulls: ExcelReelPull[] | null;
      /** Why its reels or pullings could not be read: the cables go on without them. */
      reelWarning: string | null;
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

/** The sheet with one of the names among the ones of the file, ignoring case and spaces. */
function sheetNamed(sheetNames: readonly string[], wanted: readonly string[]): string | null {
  for (const name of wanted) {
    const found = sheetNames.find((sheet) => normalizeHeader(sheet) === normalizeHeader(name));
    if (found !== undefined) return found;
  }
  return null;
}

type ReelsRead = {
  reels: ExcelReel[] | null;
  reelPulls: ExcelReelPull[] | null;
  reelWarning: string | null;
};

/**
 * The reels of a file (fase 18), from its follow-up and its stock list, and the pullings of
 * each one. They never stop the Excel of the day: a sheet that lacks columns is left out (its
 * reels or pullings stay as the last Excel left them) and the form says why.
 */
async function readReels(
  file: File,
  kind: ExcelKind,
  readSheet: SheetReader,
  readSheetNames: SheetNamesReader,
): Promise<ReelsRead> {
  const warnings: string[] = [];
  const sheetNames = await readSheetNames(file);
  const read = async (wanted: readonly string[]) => {
    const name = sheetNamed(sheetNames, wanted);
    const table = name === null ? null : await readSheet(file, name);
    return name === null || !table ? null : { name, table };
  };
  const tracking = await read(EXCEL_REEL_SHEETS.tracking);
  const stock = await read(EXCEL_REEL_SHEETS.stock);
  let reels: ExcelReel[] | null = null;
  if (tracking || stock) {
    const result = readExcelReels(kind, {
      tracking: tracking?.table ?? null,
      stock: stock?.table ?? null,
    });
    if (result.ok) reels = result.reels;
    else {
      const sheet = result.sheet === "tracking" ? tracking! : stock!;
      warnings.push(reelSheetMessage(result, sheet.name));
    }
  }
  const pullSheet = await read(EXCEL_REEL_PULL_SHEETS[kind]);
  let reelPulls: ExcelReelPull[] | null = null;
  if (pullSheet) {
    const result = readExcelReelPulls(kind, pullSheet.table);
    if (result.ok) reelPulls = result.pulls;
    else warnings.push(missing(pullSheet.name, result.missingColumns).message);
  }
  return {
    reels,
    reelPulls,
    reelWarning: warnings.length > 0 ? `Bobinas sin actualizar. ${warnings.join(" ")}` : null,
  };
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
  // Una hoja se lee una sola vez aunque la pidan dos lectores («Table»: metros y tiradas).
  const sheets = new Map<string, Promise<ExcelCell[][] | null>>();
  const uncached = readSheet;
  readSheet = (sheetFile, sheet) => {
    let table = sheets.get(sheet);
    if (!table) {
      table = uncached(sheetFile, sheet);
      sheets.set(sheet, table);
    }
    return table;
  };
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
        const reels = await readReels(file, kind, readSheet, readSheetNames).catch(() => ({
          reels: null,
          reelPulls: null,
          reelWarning: "Bobinas sin actualizar: no se pudieron leer sus hojas.",
        }));
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
          ...reels,
        };
      }
    }
  } catch {
    return { ok: false, message: "No se pudo leer el archivo. Comprueba que es un Excel (.xlsx)." };
  }
  const names = EXCEL_KINDS.map((kind) => `«${EXCEL_SHEETS[kind].sheetNames[0]}»`).join(" o ");
  return { ok: false, message: `El Excel no tiene la hoja ${names}.` };
}
