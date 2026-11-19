/**
 * Reader of the two daily status Excel files (fase 14): electrical and instrumentation.
 *
 * Pure functions, shared by the browser, which reads the file and sends only the rows, and the
 * server, which validates them again with `excelStatusRowSchema`. The columns are found by
 * their name, never by their position, accepting alternative names and ignoring case, spaces
 * and accents. If a column is missing, nothing is read: the preview says which one.
 */
import { z } from "zod";
import { cableCodeSchema } from "./cable-code";
import { CONNECTION_STATUSES, type ConnectionStatus } from "./cables";

export const EXCEL_KINDS = ["ELECTRICAL", "INSTRUMENTATION"] as const;
export type ExcelKind = (typeof EXCEL_KINDS)[number];

export const EXCEL_KIND_LABELS: Record<ExcelKind, string> = {
  ELECTRICAL: "Eléctrico",
  INSTRUMENTATION: "Instrumentación",
};

/** What a cell can hold once the spreadsheet library has read it. */
export type ExcelCell = string | number | boolean | Date | null | undefined;

type ExcelField =
  "code" | "status" | "laidOn" | "company" | "reel" | "reelStatus" | "actualLength" | "sections";

type ColumnSpec = {
  field: ExcelField;
  /** Accepted names, the first one is the one the messages use. */
  names: readonly string[];
};

type SheetSpec = {
  /** Accepted names of the sheet that holds the cables. */
  sheetNames: readonly string[];
  columns: readonly ColumnSpec[];
};

/**
 * Sheets and columns of each file. The reel takes the first name found: the reel actually
 * used before the planned one.
 */
export const EXCEL_SHEETS: Record<ExcelKind, SheetSpec> = {
  ELECTRICAL: {
    sheetNames: ["MASTER CABLE", "Master Cable"],
    columns: [
      { field: "code", names: ["Cable Code", "Código del cable", "Codigo cable"] },
      {
        field: "status",
        names: ["Estado cable (unificado)", "Estado cable", "Estado"],
      },
      { field: "laidOn", names: ["Fecha tendido", "Fecha de tendido"] },
      { field: "company", names: ["Company Real", "Empresa real", "Empresa"] },
      { field: "reel", names: ["Bobina usada", "Bobina real", "Bobina"] },
      { field: "reelStatus", names: ["Estado Bobina"] },
      {
        field: "actualLength",
        names: ["Cantidad de metros [REAL]", "Metros reales", "Cantidad de metros real"],
      },
      { field: "sections", names: ["Numero de secciones", "Número de secciones", "Secciones"] },
    ],
  },
  INSTRUMENTATION: {
    sheetNames: ["Tabl IC Maestra", "Tabla IC Maestra"],
    columns: [
      { field: "code", names: ["TAG", "Cable Code", "Código del cable"] },
      { field: "status", names: ["ESTADO", "Estado cable"] },
      { field: "laidOn", names: ["Fecha de tendido", "Fecha tendido"] },
      { field: "company", names: ["Company Real", "Empresa real", "Empresa"] },
      { field: "reel", names: ["Bobina Real en campo", "Bobina usada", "Bobina"] },
      { field: "reelStatus", names: ["Estado Bobina"] },
    ],
  },
};

/**
 * The sheet with the real metres of each cable, when the file keeps them apart: the
 * instrumentation one writes down each pulling in «Table», with the metres in «PULLED [m]».
 * That sheet holds several tables side by side with repeated headers: the first column with
 * each name is the one of the pullings.
 */
type LengthSheetSpec = {
  sheetNames: readonly string[];
  code: readonly string[];
  metres: readonly string[];
  date: readonly string[];
};

export const EXCEL_LENGTH_SHEETS: Partial<Record<ExcelKind, LengthSheetSpec>> = {
  INSTRUMENTATION: {
    sheetNames: ["Table"],
    code: ["CABLE TAG", "TAG"],
    metres: ["PULLED [m]", "Metros tendidos"],
    date: ["DATE", "Fecha"],
  },
};

/** "  Fecha  de Tendído " → "fecha de tendido": how two headers are compared. */
export function normalizeHeader(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** The sheet of a kind among the sheets of a workbook, or null. */
export function findExcelSheet(kind: ExcelKind, sheetNames: readonly string[]): string | null {
  for (const wanted of EXCEL_SHEETS[kind].sheetNames) {
    const found = sheetNames.find((name) => normalizeHeader(name) === normalizeHeader(wanted));
    if (found !== undefined) return found;
  }
  return null;
}

/** Which of the two files a workbook is, by its sheets; null if it is neither. */
export function detectExcelKind(sheetNames: readonly string[]): ExcelKind | null {
  return EXCEL_KINDS.find((kind) => findExcelSheet(kind, sheetNames) !== null) ?? null;
}

/**
 * The date of the Excel in its file name: the last date in it ("rev10_16.11.26" → 2026-11-16).
 * Null when there is none or it is not a real date.
 */
export function excelDateFromFileName(fileName: string): string | null {
  // The greedy start finds the last date: "rev10_16.11.26" is 16.11.26, not 10_16.11.
  const last = /.*(?<!\d)(\d{1,2})[._-](\d{1,2})[._-](\d{4}|\d{2})(?!\d)/s.exec(fileName);
  if (!last) return null;
  const [, day, month, year] = last;
  return isoDay(Number(year!.length === 2 ? `20${year}` : year), Number(month), Number(day));
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

/** What a status of the Excel means in the app; null: the row is ignored. */
type StatusMeaning = {
  installationStatus: "LAID" | "NOT_LAID";
  /** Null: the file says nothing about the connection (instrumentation). */
  connectionStatus: ConnectionStatus | null;
};

const ELECTRICAL_STATUSES: Record<string, StatusMeaning> = {
  "no tendido": { installationStatus: "NOT_LAID", connectionStatus: "DISCONNECTED" },
  tendido: { installationStatus: "LAID", connectionStatus: "DISCONNECTED" },
  "conectado origen": { installationStatus: "LAID", connectionStatus: "ORIGIN_ONLY" },
  "conectado destino": { installationStatus: "LAID", connectionStatus: "DESTINATION_ONLY" },
  conectado: { installationStatus: "LAID", connectionStatus: "CONNECTED" },
};

const INSTRUMENTATION_STATUSES: Record<string, StatusMeaning> = {
  // A cable that is not laid cannot be connected.
  "no tendido": { installationStatus: "NOT_LAID", connectionStatus: "DISCONNECTED" },
  tendido: { installationStatus: "LAID", connectionStatus: null },
};

const STATUSES: Record<ExcelKind, Record<string, StatusMeaning>> = {
  ELECTRICAL: ELECTRICAL_STATUSES,
  INSTRUMENTATION: INSTRUMENTATION_STATUSES,
};

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

const TEXT_LIMIT = 100;

/** One cable as the Excel says it is, ready to compare with the app. */
export const excelStatusRowSchema = z.object({
  /** Row of the sheet (1 is the header), for the messages. */
  row: z.number().int().min(2).max(1_000_000),
  code: cableCodeSchema,
  installationStatus: z.enum(["LAID", "NOT_LAID"]),
  connectionStatus: z.enum(CONNECTION_STATUSES).nullable(),
  /** Real date of laying, "YYYY-MM-DD". */
  laidOn: z.iso.date().nullable(),
  company: z.string().trim().min(1).max(TEXT_LIMIT).nullable(),
  reel: z.string().trim().min(1).max(TEXT_LIMIT).nullable(),
  reelStatus: z.string().trim().min(1).max(TEXT_LIMIT).nullable(),
  /** Real metres of the whole circuit (one section in instrumentation). */
  actualLengthTotalM: z.number().positive().max(10_000_000).nullable(),
  /** Number of sections of the circuit: the cable of each one has total / sections metres. */
  sections: z.number().int().min(1).max(1000).nullable(),
  actualLengthM: z.number().positive().max(10_000_000).nullable(),
});
export type ExcelStatusRow = z.infer<typeof excelStatusRowSchema>;

/** A row that is read but not used, and why. */
export type ExcelIgnoredRow = { row: number; code: string | null; reason: string };

export type ExcelReadResult =
  | { ok: true; kind: ExcelKind; rows: ExcelStatusRow[]; ignored: ExcelIgnoredRow[] }
  | { ok: false; kind: ExcelKind; missingColumns: string[] };

/** The real metres of each cable, read from the sheet of the pullings. */
export type ExcelLengths = {
  metres: ReadonlyMap<string, number>;
  /** Pullings of a cable written down again, and the one used instead. */
  ignored: ExcelIgnoredRow[];
};

export type ExcelLengthsResult =
  { ok: true; lengths: ExcelLengths } | { ok: false; missingColumns: string[] };

/** Position of the first header with any of the names, or -1. */
function columnOf(headers: readonly string[], names: readonly string[]): number {
  return names.map((name) => headers.indexOf(normalizeHeader(name))).find((at) => at >= 0) ?? -1;
}

/**
 * Reads the sheet of the pullings of a kind. A cable written down twice with exactly the same
 * row counts once; with different rows, the newest pulling is used (the latest date, or the
 * lower row when the dates do not tell) and the other one goes to `ignored`. Rows without a
 * valid code or without metres are skipped.
 */
export function readExcelLengths(
  kind: ExcelKind,
  table: readonly ExcelCell[][],
): ExcelLengthsResult {
  const spec = EXCEL_LENGTH_SHEETS[kind];
  const [header = [], ...body] = table;
  const headers = header.map((cell) => (typeof cell === "string" ? normalizeHeader(cell) : ""));
  const code = spec ? columnOf(headers, spec.code) : -1;
  const metres = spec ? columnOf(headers, spec.metres) : -1;
  const date = spec ? columnOf(headers, spec.date) : -1;
  const missingColumns = spec
    ? [
        [code, spec.code],
        [metres, spec.metres],
        [date, spec.date],
      ]
        .filter(([at]) => at === -1)
        .map(([, names]) => (names as readonly string[])[0]!)
    : [];
  if (!spec || missingColumns.length > 0) return { ok: false, missingColumns };

  type Pulling = { row: number; day: string | null; metres: number; content: string };
  const used = new Map<string, Pulling>();
  const ignored: ExcelIgnoredRow[] = [];
  const sheet = spec.sheetNames[0];

  body.forEach((values, offset) => {
    const row = offset + 2;
    const parsed = cableCodeSchema.safeParse(text(values[code]));
    const pulled = positive(values[metres]);
    if (!parsed.success || pulled === null) return;
    const pulling: Pulling = {
      row,
      day: day(values[date]),
      metres: pulled,
      content: JSON.stringify(values.map((cell) => cell ?? null)),
    };
    const before = used.get(parsed.data);
    if (before === undefined) {
      used.set(parsed.data, pulling);
      return;
    }
    // Exactly the same row twice: it is one pulling.
    if (before.content === pulling.content) return;
    const newer =
      before.day !== null && pulling.day !== null && before.day !== pulling.day
        ? pulling.day > before.day
        : true;
    const [kept, dropped] = newer ? [pulling, before] : [before, pulling];
    used.set(parsed.data, kept);
    ignored.push({
      row: dropped.row,
      code: parsed.data,
      reason: `Tendido repetido en la hoja «${sheet}»: se usa la fila ${kept.row}`,
    });
  });

  return {
    ok: true,
    lengths: {
      metres: new Map([...used].map(([cable, pulling]) => [cable, pulling.metres])),
      ignored,
    },
  };
}

/**
 * Reads the sheet of a kind, given as rows of cells with the header first. Rows without a
 * code are skipped silently (blank lines); rows with an ignored status («Check», «Error»), no
 * status, an invalid code or a code already read are returned in `ignored` with the reason.
 * The real metres come from the sheet itself (electrical) or from `lengths`, read apart from
 * the sheet of the pullings (instrumentation).
 */
export function readExcelStatus(
  kind: ExcelKind,
  table: readonly ExcelCell[][],
  lengths?: ExcelLengths,
): ExcelReadResult {
  const [header = [], ...body] = table;
  const headers = header.map((cell) => (typeof cell === "string" ? normalizeHeader(cell) : ""));
  const index = new Map<ExcelField, number>();
  const missingColumns: string[] = [];
  for (const column of EXCEL_SHEETS[kind].columns) {
    const position = column.names
      .map((name) => headers.indexOf(normalizeHeader(name)))
      .find((found) => found >= 0);
    if (position === undefined) missingColumns.push(column.names[0]!);
    else index.set(column.field, position);
  }
  if (missingColumns.length > 0) return { ok: false, kind, missingColumns };

  const cell = (values: readonly ExcelCell[], field: ExcelField) => {
    const position = index.get(field);
    return position === undefined ? null : values[position];
  };
  const rows: ExcelStatusRow[] = [];
  const ignored: ExcelIgnoredRow[] = [];
  const seen = new Map<string, number>();

  body.forEach((values, offset) => {
    const row = offset + 2;
    const rawCode = text(cell(values, "code"));
    if (rawCode === null) return;
    const parsedCode = cableCodeSchema.safeParse(rawCode);
    if (!parsedCode.success) {
      ignored.push({ row, code: rawCode, reason: "Código no válido" });
      return;
    }
    const code = parsedCode.data;
    const status = text(cell(values, "status"));
    if (status === null) {
      ignored.push({ row, code, reason: "Sin estado" });
      return;
    }
    const meaning = STATUSES[kind][normalizeHeader(status)];
    if (!meaning) {
      ignored.push({ row, code, reason: `Estado «${status}»: no se usa` });
      return;
    }
    const first = seen.get(code);
    if (first !== undefined) {
      ignored.push({ row, code, reason: `Repetido: ya está en la fila ${first}` });
      return;
    }
    seen.set(code, row);

    const laid = meaning.installationStatus === "LAID";
    const total = !laid
      ? null
      : lengths
        ? (lengths.metres.get(code) ?? null)
        : positive(cell(values, "actualLength"));
    const sections = wholeNumber(cell(values, "sections"));
    rows.push({
      row,
      code,
      ...meaning,
      laidOn: laid ? day(cell(values, "laidOn")) : null,
      company: text(cell(values, "company")),
      reel: text(cell(values, "reel")),
      reelStatus: text(cell(values, "reelStatus")),
      actualLengthTotalM: total,
      sections: kind === "ELECTRICAL" ? sections : null,
      actualLengthM: total === null ? null : round2(total / (sections ?? 1)),
    });
  });

  return { ok: true, kind, rows, ignored: [...ignored, ...(lengths?.ignored ?? [])] };
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

/** Excel shows formula errors as text: "#N/A", "#NAME?", "#REF!". */
const EXCEL_ERROR = /^#[A-Z0-9/]+[!?]?$/i;

/** Trimmed text of a cell, with its spaces collapsed; null when empty or an Excel error. */
function text(value: ExcelCell): string | null {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  if (value instanceof Date) return null;
  const result = String(value).replace(/\s+/g, " ").trim();
  if (result === "" || EXCEL_ERROR.test(result)) return null;
  return result.slice(0, TEXT_LIMIT);
}

function number(value: ExcelCell): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const content = text(value);
  if (content === null) return null;
  // "1.234,5" or "1234.5": the last separator is the decimal one.
  const normalized = /,\d{1,2}$/.test(content)
    ? content.replace(/\./g, "").replace(",", ".")
    : content.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value: ExcelCell): number | null {
  const parsed = number(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function wholeNumber(value: ExcelCell): number | null {
  const parsed = number(value);
  return parsed !== null && Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Days between 1899-12-30 and 1970-01-01: Excel's serial dates. */
const EXCEL_EPOCH_DAYS = 25_569;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A date cell as "YYYY-MM-DD": a Date, an Excel serial number or "d/m/yyyy". */
function day(value: ExcelCell): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return isoDay(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 1) return null;
    const date = new Date((Math.floor(value) - EXCEL_EPOCH_DAYS) * DAY_MS);
    return isoDay(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  const content = text(value);
  if (content === null) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(content);
  if (iso) return isoDay(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/.exec(content);
  if (local) {
    const year = local[3]!.length === 2 ? `20${local[3]}` : local[3]!;
    return isoDay(Number(year), Number(local[2]), Number(local[1]));
  }
  return null;
}

/** "YYYY-MM-DD" for a real calendar date between 2000 and 2099, or null. */
function isoDay(year: number, month: number, dayOfMonth: number): string | null {
  if (year < 2000 || year > 2099) return null;
  const date = new Date(Date.UTC(year, month - 1, dayOfMonth));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== dayOfMonth) return null;
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// How the cable record shows it
// ---------------------------------------------------------------------------

/** "2026-07-11" → "11/07/2026": dates of the Excel, always with the day, never "hoy". */
export function formatExcelDay(day: string): string {
  const [year, month, dayOfMonth] = day.split("-");
  return `${dayOfMonth}/${month}/${year}`;
}

const metres = (value: number) => `${String(value).replace(".", ",")} m`;

/**
 * The length rows of a cable: «Longitud» alone, or «Longitud prevista» and «Longitud real»
 * when the Excel brings the real metres. A circuit of several sections says the metres of
 * each cable and of the whole circuit.
 */
export function cableLengthItems(cable: {
  lengthM: number | null;
  lengthPending: boolean;
  actualLengthM: number | null;
  actualLengthTotalM: number | null;
  actualSections: number | null;
}): { label: string; value: string | null }[] {
  const planned =
    cable.lengthM === null && !cable.lengthPending
      ? null
      : `${cable.lengthM === null ? "Sin longitud" : metres(cable.lengthM)}${cable.lengthPending ? " (pendiente)" : ""}`;
  if (cable.actualLengthM === null) return [{ label: "Longitud", value: planned }];
  const sections = cable.actualSections ?? 1;
  const real =
    sections > 1 && cable.actualLengthTotalM !== null
      ? `${metres(cable.actualLengthM)} por tramo · ${metres(cable.actualLengthTotalM)} en total, ${sections} tramos`
      : metres(cable.actualLengthM);
  return [
    { label: "Longitud prevista", value: planned },
    { label: "Longitud real", value: real },
  ];
}

/** "B-101 · En obra": the reel and its state, whichever the Excel brings. */
export function reelText(reel: string | null, reelStatus: string | null): string | null {
  const parts = [reel, reelStatus].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}
