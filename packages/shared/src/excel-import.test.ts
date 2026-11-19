import { describe, expect, it } from "vitest";
import {
  EXCEL_UPLOAD_CHUNK,
  excelPreviewInputSchema,
  excelPreviewParts,
  madridDay,
  planExcelRow,
  type ExcelCableSnapshot,
} from "./excel-import";
import type { ExcelStatusRow } from "./excel-status";

// Datos inventados.
const row = (overrides: Partial<ExcelStatusRow> = {}): ExcelStatusRow => ({
  row: 2,
  code: "ZZ-100",
  installationStatus: "LAID",
  connectionStatus: "DISCONNECTED",
  laidOn: "2026-07-11",
  company: "Montajes Ficticios",
  reel: "B-01",
  reelStatus: "En obra",
  actualLengthTotalM: 120,
  sections: 2,
  actualLengthM: 60,
  ...overrides,
});

const cable = (overrides: Partial<ExcelCableSnapshot> = {}): ExcelCableSnapshot => ({
  deleted: false,
  installationStatus: "NOT_LAID",
  connectionStatus: "DISCONNECTED",
  looseEnd: null,
  looseEndTray: null,
  laidOn: null,
  company: null,
  reel: null,
  reelStatus: null,
  actualLengthM: null,
  actualLengthTotalM: null,
  actualSections: null,
  ...overrides,
});

/** The cable already holding everything the Excel row says. */
const synced = (overrides: Partial<ExcelCableSnapshot> = {}) =>
  cable({
    installationStatus: "LAID",
    laidOn: "2026-07-11",
    company: "Montajes Ficticios",
    reel: "B-01",
    reelStatus: "En obra",
    actualLengthM: 60,
    actualLengthTotalM: 120,
    actualSections: 2,
    ...overrides,
  });

const plan = (input: Partial<Parameters<typeof planExcelRow>[0]> = {}) =>
  planExcelRow({
    kind: "ELECTRICAL",
    excelDate: "2026-11-16",
    row: row(),
    cable: cable(),
    webMark: null,
    openDiscrepancy: null,
    ...input,
  });

describe("planExcelRow", () => {
  it("creates a cable that is not in the web with what the Excel brings", () => {
    const result = plan({ cable: null, row: row({ reelStatus: null }) });

    expect(result.kind).toBe("NEW");
    expect(result.kind === "NEW" && result.changes).toEqual({
      installationStatus: { from: null, to: "LAID" },
      connectionStatus: { from: null, to: "DISCONNECTED" },
      laidOn: { from: null, to: "2026-07-11" },
      company: { from: null, to: "Montajes Ficticios" },
      reel: { from: null, to: "B-01" },
      actualLengthM: { from: null, to: 60 },
      actualLengthTotalM: { from: null, to: 120 },
      actualSections: { from: null, to: 2 },
    });
  });

  it("changes the state and the data when no person marked anything", () => {
    const result = plan();

    expect(result).toMatchObject({
      kind: "CHANGE",
      changes: {
        installationStatus: { from: "NOT_LAID", to: "LAID" },
        reel: { from: null, to: "B-01" },
      },
    });
  });

  it("does nothing when the cable already says the same", () => {
    expect(plan({ cable: synced() })).toEqual({ kind: "NONE", agreesWithDiscrepancyId: null });
  });

  it("does not erase what the cable has with an empty cell of the Excel", () => {
    const result = plan({
      cable: synced(),
      row: row({ reel: null, reelStatus: null, company: null, laidOn: null }),
    });

    expect(result).toEqual({ kind: "NONE", agreesWithDiscrepancyId: null });
  });

  it("takes the same company whatever its case or spaces", () => {
    expect(plan({ cable: synced({ company: "  montajes   FICTICIOS" }) }).kind).toBe("NONE");
  });

  it("takes the real metres of the instrumentation Excel, without sections", () => {
    const result = plan({
      kind: "INSTRUMENTATION",
      row: row({
        connectionStatus: null,
        actualLengthM: 105,
        actualLengthTotalM: 105,
        sections: null,
      }),
      cable: synced({ actualLengthM: null, actualLengthTotalM: null, actualSections: null }),
    });

    expect(result).toEqual({
      kind: "CHANGE",
      agreesWithDiscrepancyId: null,
      changes: {
        actualLengthM: { from: null, to: 105 },
        actualLengthTotalM: { from: null, to: 105 },
      },
    });
  });

  it("keeps the real metres of an instrumentation cable without a pulling in the Excel", () => {
    const result = plan({
      kind: "INSTRUMENTATION",
      row: row({
        connectionStatus: null,
        actualLengthM: null,
        actualLengthTotalM: null,
        sections: null,
      }),
      cable: synced(),
    });

    expect(result.kind).toBe("NONE");
  });

  it("keeps the connection when the Excel says nothing about it", () => {
    const result = plan({
      kind: "INSTRUMENTATION",
      row: row({ connectionStatus: null }),
      cable: synced({ connectionStatus: "ORIGIN_ONLY" }),
    });

    expect(result.kind).toBe("NONE");
  });

  it("ends a partial laying when the Excel says it is laid", () => {
    const result = plan({
      cable: synced({
        installationStatus: "PARTIALLY_LAID",
        looseEnd: "ORIGIN",
        looseEndTray: "T-1",
      }),
    });

    expect(result).toMatchObject({
      kind: "CHANGE",
      changes: {
        installationStatus: { from: "PARTIALLY_LAID", to: "LAID" },
        looseEnd: { from: "ORIGIN", to: null },
        looseEndTray: { from: "T-1", to: null },
      },
    });
  });

  it("is a discrepancy when a person marked it before the date of the Excel", () => {
    const webMark = { eventId: "e1", at: new Date("2026-11-14T10:00:00Z") };
    const result = plan({
      row: row({ installationStatus: "NOT_LAID", laidOn: null, company: null, reel: null }),
      cable: cable({ installationStatus: "LAID" }),
      webMark,
    });

    expect(result).toEqual({
      kind: "DISCREPANCY",
      changes: {
        reelStatus: { from: null, to: "En obra" },
        actualLengthM: { from: null, to: 60 },
        actualLengthTotalM: { from: null, to: 120 },
        actualSections: { from: null, to: 2 },
      },
      conflict: {
        web: { installationStatus: "LAID", connectionStatus: "DISCONNECTED" },
        excel: { installationStatus: "NOT_LAID", connectionStatus: "DISCONNECTED" },
        webEventId: "e1",
        webAt: "2026-11-14T10:00:00.000Z",
        discrepancyId: null,
      },
    });
  });

  it("does not count when the person marked it on the day of the Excel or later", () => {
    // 23:30 UTC del 15 es ya el 16 en Madrid.
    const webMark = { eventId: "e1", at: new Date("2026-11-15T23:30:00Z") };
    const result = plan({ cable: synced({ installationStatus: "NOT_LAID" }), webMark });

    expect(result).toEqual({ kind: "NONE", agreesWithDiscrepancyId: null });
  });

  it("keeps the web while a discrepancy is open, and the Excel contradicts it again", () => {
    const openDiscrepancy = { id: "d1", webEventId: "e1", webAt: new Date("2026-11-10T08:00:00Z") };
    const result = plan({ cable: synced({ installationStatus: "NOT_LAID" }), openDiscrepancy });

    expect(result).toMatchObject({
      kind: "DISCREPANCY",
      changes: {},
      conflict: { discrepancyId: "d1", webEventId: "e1" },
    });
  });

  it("only notices that a later Excel already agrees with an open discrepancy", () => {
    const openDiscrepancy = { id: "d1", webEventId: "e1", webAt: new Date("2026-11-10T08:00:00Z") };

    expect(plan({ cable: synced(), openDiscrepancy })).toEqual({
      kind: "NONE",
      agreesWithDiscrepancyId: "d1",
    });
    expect(plan({ cable: synced({ reel: "B-02" }), openDiscrepancy })).toMatchObject({
      kind: "CHANGE",
      agreesWithDiscrepancyId: "d1",
    });
  });

  it("ignores a cable removed in the web", () => {
    expect(plan({ cable: cable({ deleted: true }) })).toEqual({
      kind: "IGNORED",
      reason: "Dado de baja en la web",
    });
  });
});

describe("madridDay", () => {
  it("gives the day in the plant's time zone", () => {
    expect(madridDay(new Date("2026-11-15T22:59:00Z"))).toBe("2026-11-15");
    expect(madridDay(new Date("2026-11-15T23:00:00Z"))).toBe("2026-11-16");
  });
});

describe("excelPreviewInputSchema", () => {
  const input = {
    kind: "ELECTRICAL",
    excelDate: "2026-11-16",
    fileName: "estado.xlsx",
    ignored: [],
  };

  it("accepts the rows read by the browser", () => {
    const parsed = excelPreviewInputSchema.parse({ ...input, rows: [row()] });

    expect(parsed.projectLoad).toBe(false);
  });

  it("refuses a repeated cable and sections in the instrumentation Excel", () => {
    expect(
      excelPreviewInputSchema.safeParse({ ...input, rows: [row(), row({ row: 3 })] }).success,
    ).toBe(false);
    expect(
      excelPreviewInputSchema.safeParse({ ...input, kind: "INSTRUMENTATION", rows: [row()] })
        .success,
    ).toBe(false);
  });
});

describe("excelPreviewParts", () => {
  it("splits the rows and the ignored ones into parts of the same size, in order", () => {
    const rows = Array.from({ length: EXCEL_UPLOAD_CHUNK + 1 }, (_, index) => index);
    const parts = excelPreviewParts(rows, ["a"]);

    expect(parts.map((part) => [part.rows.length, part.ignored])).toEqual([
      [EXCEL_UPLOAD_CHUNK, ["a"]],
      [1, []],
    ]);
  });

  it("sends one part even for an Excel without rows", () => {
    expect(excelPreviewParts([], [])).toEqual([{ rows: [], ignored: [] }]);
  });
});
