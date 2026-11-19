/**
 * What the Excel of the day does to each cable (fase 14): pure rules shared by the preview and
 * the batches that apply it, so both decide the same and can be tested without a database.
 */
import { z } from "zod";
import type { CableEndSide } from "./cable-actions";
import { type ConnectionStatus, type FieldChange, type InstallationStatus } from "./cables";
import {
  EXCEL_KINDS,
  excelStatusRowSchema,
  type ExcelKind,
  type ExcelStatusRow,
} from "./excel-status";
import { firstParams, pageSchema, type RawSearchParams } from "./url-params";

/** Most rows a file may bring: the real ones have a few thousand. */
export const EXCEL_MAX_ROWS = 20_000;

/** Rows applied in one transaction: small enough to stay far from the time limit. */
export const EXCEL_APPLY_BATCH = 200;

const ignoredRowSchema = z.object({
  row: z.number().int().min(2).max(1_000_000),
  code: z.string().max(200).nullable(),
  reason: z.string().min(1).max(200),
});

/**
 * Rows sent in one request: the browser sends the file in parts (about 250 KB each), far from
 * the body limit of a Server Action whatever the size of the Excel.
 */
export const EXCEL_UPLOAD_CHUNK = 1000;

/** First step of an upload: what the file is and how many rows will arrive. */
export const excelPreviewStartSchema = z.object({
  kind: z.enum(EXCEL_KINDS, { error: "Tipo de Excel no válido" }),
  excelDate: z.iso.date({ error: "Indica la fecha del Excel" }),
  fileName: z.string().trim().min(1, "Falta el nombre del archivo").max(300),
  /** The first load of the project: admins only, never shown, no discrepancies. */
  projectLoad: z.boolean().default(false),
  rowCount: z.number().int().min(0).max(EXCEL_MAX_ROWS, "El Excel tiene demasiadas filas"),
});
export type ExcelPreviewStart = z.input<typeof excelPreviewStartSchema>;

/** One part of the rows of an upload, with the ignored rows of that part. */
export const excelPreviewPartSchema = z
  .object({
    importId: z.string().min(1).max(100),
    rows: z.array(excelStatusRowSchema).max(EXCEL_UPLOAD_CHUNK),
    ignored: z.array(ignoredRowSchema).max(EXCEL_UPLOAD_CHUNK),
  })
  .superRefine((part, ctx) => {
    const seen = new Set<string>();
    for (const row of part.rows) {
      if (seen.has(row.code)) {
        ctx.addIssue({
          code: "custom",
          message: `El cable ${row.code} está repetido`,
          path: ["rows"],
        });
        return;
      }
      seen.add(row.code);
    }
  });
export type ExcelPreviewPart = z.input<typeof excelPreviewPartSchema>;

/** Splits what the browser read into the parts it sends, in order. */
export function excelPreviewParts<Row, Ignored>(
  rows: readonly Row[],
  ignored: readonly Ignored[],
): { rows: Row[]; ignored: Ignored[] }[] {
  const count = Math.max(1, Math.ceil(Math.max(rows.length, ignored.length) / EXCEL_UPLOAD_CHUNK));
  return Array.from({ length: count }, (_, index) => ({
    rows: rows.slice(index * EXCEL_UPLOAD_CHUNK, (index + 1) * EXCEL_UPLOAD_CHUNK),
    ignored: ignored.slice(index * EXCEL_UPLOAD_CHUNK, (index + 1) * EXCEL_UPLOAD_CHUNK),
  }));
}

/** A whole file at once (the tests, and the upload step by step underneath). */
export const excelPreviewInputSchema = z
  .object({
    kind: z.enum(EXCEL_KINDS, { error: "Tipo de Excel no válido" }),
    excelDate: z.iso.date({ error: "Indica la fecha del Excel" }),
    fileName: z.string().trim().min(1, "Falta el nombre del archivo").max(300),
    /** The first load of the project: admins only, never shown, no discrepancies. */
    projectLoad: z.boolean().default(false),
    rows: z.array(excelStatusRowSchema).max(EXCEL_MAX_ROWS, "El Excel tiene demasiadas filas"),
    ignored: z.array(ignoredRowSchema).max(EXCEL_MAX_ROWS),
  })
  .superRefine((input, ctx) => {
    const seen = new Set<string>();
    for (const row of input.rows) {
      if (seen.has(row.code)) {
        ctx.addIssue({
          code: "custom",
          message: `El cable ${row.code} está repetido`,
          path: ["rows"],
        });
        return;
      }
      seen.add(row.code);
    }
    if (input.kind === "INSTRUMENTATION" && input.rows.some((row) => row.sections !== null)) {
      ctx.addIssue({
        code: "custom",
        message: "El Excel de instrumentación no trae tramos",
        path: ["rows"],
      });
    }
  });
export type ExcelPreviewInput = z.input<typeof excelPreviewInputSchema>;

/** Marks or unmarks rows of a preview; without `rowIds`, all of them. */
export const excelRowSelectionSchema = z.object({
  importId: z.string().min(1).max(100),
  rowIds: z.array(z.string().min(1).max(100)).min(1).max(EXCEL_MAX_ROWS).optional(),
  /** Only the rows of one tab (with no `rowIds`). */
  kind: z.enum(["CHANGE", "NEW", "DISCREPANCY"]).optional(),
  selected: z.boolean(),
});
export type ExcelRowSelection = z.infer<typeof excelRowSelectionSchema>;

/** Installation and connection: the Excel and the web are compared as one state. */
export type ExcelCableState = {
  installationStatus: InstallationStatus;
  connectionStatus: ConnectionStatus;
};

/** The cable as the app has it now, with the company by name and the dates as "YYYY-MM-DD". */
export type ExcelCableSnapshot = ExcelCableState & {
  deleted: boolean;
  looseEnd: CableEndSide | null;
  looseEndTray: string | null;
  laidOn: string | null;
  company: string | null;
  reel: string | null;
  reelStatus: string | null;
  actualLengthM: number | null;
  actualLengthTotalM: number | null;
  actualSections: number | null;
};

/**
 * The last time a person changed the state in the web, when nothing written by an Excel
 * changed it afterwards: only then may an Excel contradict a person.
 */
export type WebStateMark = { eventId: string; at: Date };

/** A discrepancy of the cable still waiting for a decision, with the person's mark. */
export type OpenDiscrepancy = { id: string; webEventId: string; webAt: Date };

export type ExcelConflict = {
  web: ExcelCableState;
  excel: ExcelCableState;
  webEventId: string;
  /** When the person marked it (ISO). */
  webAt: string;
  /** The open discrepancy the Excel contradicts again, or null for a new one. */
  discrepancyId: string | null;
};

/** `agreesWithDiscrepancyId`: the open discrepancy this Excel already agrees with. */
export type ExcelRowPlan =
  | { kind: "NONE"; agreesWithDiscrepancyId: string | null }
  | { kind: "IGNORED"; reason: string }
  | { kind: "NEW"; changes: Record<string, FieldChange> }
  | {
      kind: "CHANGE";
      changes: Record<string, FieldChange>;
      agreesWithDiscrepancyId: string | null;
    }
  | { kind: "DISCREPANCY"; changes: Record<string, FieldChange>; conflict: ExcelConflict };

/** The data fields each Excel brings; the instrumentation one has no real metres. */
const DATA_FIELDS: Record<ExcelKind, readonly ExcelDataField[]> = {
  ELECTRICAL: [
    "laidOn",
    "company",
    "reel",
    "reelStatus",
    "actualLengthM",
    "actualLengthTotalM",
    "actualSections",
  ],
  INSTRUMENTATION: ["laidOn", "company", "reel", "reelStatus"],
};

type ExcelDataField =
  | "laidOn"
  | "company"
  | "reel"
  | "reelStatus"
  | "actualLengthM"
  | "actualLengthTotalM"
  | "actualSections";

function excelValue(row: ExcelStatusRow, field: ExcelDataField): string | number | null {
  return field === "actualSections" ? row.sections : row[field];
}

/** Company names are the same company whatever their case or spaces. */
const sameCompany = (a: string | null, b: string | null) =>
  (a ?? "").replace(/\s+/g, " ").trim().toLowerCase() ===
  (b ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** "YYYY-MM-DD" of a moment, in the plant's time zone. */
export function madridDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** The state the Excel says, keeping the connection when the file says nothing about it. */
export function excelState(row: ExcelStatusRow, current: ConnectionStatus): ExcelCableState {
  return {
    installationStatus: row.installationStatus,
    connectionStatus: row.connectionStatus ?? current,
  };
}

const sameState = (a: ExcelCableState, b: ExcelCableState) =>
  a.installationStatus === b.installationStatus && a.connectionStatus === b.connectionStatus;

/** Changes that move the cable to a state, ending a partial laying if it leaves it. */
function stateChanges(cable: ExcelCableSnapshot, to: ExcelCableState): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {};
  if (cable.installationStatus !== to.installationStatus) {
    changes.installationStatus = { from: cable.installationStatus, to: to.installationStatus };
  }
  if (cable.connectionStatus !== to.connectionStatus) {
    changes.connectionStatus = { from: cable.connectionStatus, to: to.connectionStatus };
  }
  if (to.installationStatus !== "PARTIALLY_LAID") {
    if (cable.looseEnd !== null) changes.looseEnd = { from: cable.looseEnd, to: null };
    if (cable.looseEndTray !== null) changes.looseEndTray = { from: cable.looseEndTray, to: null };
  }
  return changes;
}

/**
 * What one row of the Excel does to its cable:
 * - not in the web: it is created with what the Excel brings;
 * - the date, company, reel and real metres are always the Excel's (nobody marks them in the
 *   web); origin, destination, type and the planned length are never touched;
 * - the state changes, unless a person marked it in the web: before the date of the Excel it
 *   is a discrepancy, on that day or later the web is newer and the Excel does not count;
 * - with a discrepancy still open the cable keeps the web's state: the Excel contradicts it
 *   again, or already agrees (only a notice, it never closes by itself).
 *
 * The first load of the project passes no mark nor discrepancy: everything is the Excel's.
 */
export function planExcelRow(input: {
  kind: ExcelKind;
  excelDate: string;
  row: ExcelStatusRow;
  cable: ExcelCableSnapshot | null;
  webMark: WebStateMark | null;
  openDiscrepancy: OpenDiscrepancy | null;
}): ExcelRowPlan {
  const { kind, excelDate, row, cable, webMark, openDiscrepancy } = input;
  const fields = DATA_FIELDS[kind];

  if (cable === null) {
    const state = excelState(row, "DISCONNECTED");
    const changes: Record<string, FieldChange> = {
      installationStatus: { from: null, to: state.installationStatus },
      connectionStatus: { from: null, to: state.connectionStatus },
    };
    for (const field of fields) {
      const to = excelValue(row, field);
      if (to !== null) changes[field] = { from: null, to };
    }
    return { kind: "NEW", changes };
  }
  if (cable.deleted) return { kind: "IGNORED", reason: "Dado de baja en la web" };

  const changes: Record<string, FieldChange> = {};
  for (const field of fields) {
    const from = cable[field];
    const to = excelValue(row, field);
    const same =
      field === "company" ? sameCompany(from as string | null, to as string | null) : from === to;
    if (!same) changes[field] = { from, to };
  }

  const web: ExcelCableState = {
    installationStatus: cable.installationStatus,
    connectionStatus: cable.connectionStatus,
  };
  const excel = excelState(row, cable.connectionStatus);
  const conflict = (webEvent: WebStateMark, discrepancyId: string | null): ExcelRowPlan => ({
    kind: "DISCREPANCY",
    changes,
    conflict: {
      web,
      excel,
      webEventId: webEvent.eventId,
      webAt: webEvent.at.toISOString(),
      discrepancyId,
    },
  });
  const done = (agreesWithDiscrepancyId: string | null = null): ExcelRowPlan =>
    Object.keys(changes).length > 0
      ? { kind: "CHANGE", changes, agreesWithDiscrepancyId }
      : { kind: "NONE", agreesWithDiscrepancyId };

  if (sameState(web, excel)) return done(openDiscrepancy?.id ?? null);
  if (openDiscrepancy) {
    return conflict(
      { eventId: openDiscrepancy.webEventId, at: openDiscrepancy.webAt },
      openDiscrepancy.id,
    );
  }
  if (webMark) {
    if (madridDay(webMark.at) < excelDate) return conflict(webMark, null);
    return done();
  }
  Object.assign(changes, stateChanges(cable, excel));
  return done();
}

/** What a preview holds, for its summary. */
export type ExcelPreviewCounts = { changes: number; created: number; discrepancies: number };

// ---------------------------------------------------------------------------
// The preview as it travels in the URL
// ---------------------------------------------------------------------------

export const EXCEL_PREVIEW_TABS = ["changes", "new", "discrepancies"] as const;
export type ExcelPreviewTab = (typeof EXCEL_PREVIEW_TABS)[number];
export const EXCEL_PREVIEW_TAB_LABELS: Record<ExcelPreviewTab, string> = {
  changes: "Cambios",
  new: "Nuevos",
  discrepancies: "Discrepancias",
};
export const EXCEL_PREVIEW_PAGE_SIZE = 50;

export const excelPreviewSearchSchema = z.object({
  tab: z.enum(EXCEL_PREVIEW_TABS).optional().catch(undefined),
  page: pageSchema,
});
export type ExcelPreviewSearch = z.infer<typeof excelPreviewSearchSchema>;

export const parseExcelPreviewSearch = (params: RawSearchParams): ExcelPreviewSearch =>
  excelPreviewSearchSchema.parse(firstParams(params));
