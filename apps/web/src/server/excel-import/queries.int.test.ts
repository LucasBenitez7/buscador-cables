import { randomUUID } from "node:crypto";
import { prisma } from "@cables/db";
import { permissionsOfRole, type ExcelStatusRow } from "@cables/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { getExcelOverview, getExcelPreview, stateText } from "./queries";
import { applyExcelBatch, createExcelPreview } from "./service";

// Datos inventados.
let supervisor: { id: string; role: string; permissions: readonly string[] };

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "cable_discrepancy", "excel_import_row", "excel_import", "cable_event", "cable", "company", "user" CASCADE',
  );
  const user = await prisma.user.create({
    data: { id: randomUUID(), name: "Sara", email: "sara@cables.test", role: "SUPERVISOR" },
  });
  supervisor = { id: user.id, role: "SUPERVISOR", ...permissionsOfRole("SUPERVISOR") };
});

const row = (code: string, overrides: Partial<ExcelStatusRow> = {}): ExcelStatusRow => ({
  row: 2,
  code,
  installationStatus: "LAID",
  connectionStatus: "ORIGIN_ONLY",
  laidOn: "2026-11-10",
  company: "Montajes Ficticios",
  reel: null,
  reelStatus: null,
  actualLengthTotalM: null,
  sections: null,
  actualLengthM: null,
  ...overrides,
});

const upload = (rows: ExcelStatusRow[], excelDate = "2026-11-16") =>
  createExcelPreview(supervisor, {
    kind: "ELECTRICAL",
    excelDate,
    fileName: "estado.xlsx",
    ignored: [],
    rows: rows.map((item, index) => ({ ...item, row: index + 2 })),
  });

describe("getExcelOverview", () => {
  it("shows the preview waiting and the last Excel applied of each kind", async () => {
    await prisma.cable.create({ data: { code: "ZZ-1" } });
    const applied = await upload([row("ZZ-1")], "2026-11-15");
    await applyExcelBatch(supervisor, applied.importId);
    const waiting = await upload([row("ZZ-2"), row("ZZ-3")]);

    const [electrical, instrumentation] = await getExcelOverview();

    expect(electrical).toMatchObject({
      kind: "ELECTRICAL",
      label: "Eléctrico",
      projectLoadAvailable: false,
      lastApplied: { excelDay: "15/11/2026", uploadedBy: "Sara" },
      current: {
        id: waiting.importId,
        excelDay: "16/11/2026",
        status: "PREVIEW",
        counts: { changes: 0, created: 2, discrepancies: 0 },
        selected: 2,
        applied: 0,
      },
    });
    expect(instrumentation).toMatchObject({
      current: null,
      lastApplied: null,
      projectLoadAvailable: true,
    });
  });
});

describe("getExcelPreview", () => {
  it("pages the rows of a tab with their changes in words", async () => {
    await prisma.cable.create({ data: { code: "ZZ-1" } });
    const { importId } = await upload([row("ZZ-1"), row("ZZ-2")]);

    const changes = await getExcelPreview(importId, {});
    expect(changes).toMatchObject({ tab: "changes", total: 1, page: 1, pageCount: 1 });
    expect(changes!.rows[0]).toMatchObject({ code: "ZZ-1", selected: true, conflict: null });
    expect(changes!.rows[0]!.changes).toEqual(
      expect.arrayContaining([
        { field: "Estado de instalación", from: "No tendido", to: "Tendido" },
        { field: "Fecha de tendido", from: "—", to: "10/11/2026" },
      ]),
    );

    const created = await getExcelPreview(importId, { tab: "new", page: 9 });
    expect(created).toMatchObject({ tab: "new", total: 1, page: 1 });
    expect(created!.rows[0]).toMatchObject({ code: "ZZ-2", cableId: null });
  });

  it("says who marked the web state that the Excel contradicts", async () => {
    const cable = await prisma.cable.create({
      data: { code: "ZZ-1", installationStatus: "LAID" },
    });
    await prisma.cableEvent.create({
      data: {
        cableId: cable.id,
        userId: supervisor.id,
        action: "LAID",
        changes: { installationStatus: { from: "NOT_LAID", to: "LAID" } },
        createdAt: new Date("2026-11-12T09:00:00Z"),
      },
    });
    const { importId } = await upload([
      row("ZZ-1", {
        installationStatus: "NOT_LAID",
        connectionStatus: "DISCONNECTED",
        laidOn: null,
      }),
    ]);

    const preview = await getExcelPreview(importId, {});

    expect(preview!.tab).toBe("discrepancies");
    expect(preview!.rows[0]!.conflict).toEqual({
      web: "Tendido",
      excel: "No tendido",
      by: "Sara",
      at: "12/11/26, 10:00",
      again: false,
    });
  });

  it("does not show an upload still arriving nor one that does not exist", async () => {
    expect(await getExcelPreview("nope", {})).toBeNull();
    const half = await prisma.excelImport.create({
      data: {
        kind: "ELECTRICAL",
        excelDate: new Date("2026-11-16T00:00:00Z"),
        fileName: "estado.xlsx",
        status: "UPLOADING",
        uploadedById: supervisor.id,
        rowCount: 5,
        ignored: [],
      },
    });
    expect(await getExcelPreview(half.id, {})).toBeNull();
  });
});

describe("stateText", () => {
  it("reads a state in one line", () => {
    expect(stateText({ installationStatus: "LAID", connectionStatus: "ORIGIN_ONLY" })).toBe(
      "Tendido · Solo origen",
    );
    expect(stateText({ installationStatus: "NOT_LAID", connectionStatus: "DISCONNECTED" })).toBe(
      "No tendido",
    );
  });
});
