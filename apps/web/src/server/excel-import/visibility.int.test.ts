import { randomUUID } from "node:crypto";
import { prisma } from "@cables/db";
import { permissionsOfRole, type ExcelStatusRow } from "@cables/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { listActivity } from "@/server/activity/service";
import { getCableDetail } from "@/server/cables/detail";
import { searchCables } from "@/server/cables/search";
import { applyExcelBatch, createExcelPreview } from "./service";

// Datos inventados. La primera carga del Excel es la carga del proyecto: se guarda, pero no
// se ve en la actividad, el historial de la ficha ni la última acción de la tabla.
let admin: { id: string; role: string; permissions: readonly string[] };

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "cable_discrepancy", "excel_import_row", "excel_import", "cable_event", "cable", "company", "user" CASCADE',
  );
  const user = await prisma.user.create({
    data: { id: randomUUID(), name: "Ada", email: "ada@cables.test", role: "ADMIN" },
  });
  admin = { id: user.id, role: "ADMIN", ...permissionsOfRole("ADMIN") };
});

const row = (code: string, overrides: Partial<ExcelStatusRow> = {}): ExcelStatusRow => ({
  row: 2,
  code,
  installationStatus: "LAID",
  connectionStatus: "DISCONNECTED",
  laidOn: "2026-11-10",
  company: "Montajes Ficticios",
  reel: null,
  reelStatus: null,
  actualLengthTotalM: null,
  sections: null,
  actualLengthM: null,
  ...overrides,
});

async function applyExcel(rows: ExcelStatusRow[], excelDate: string, projectLoad: boolean) {
  const { importId } = await createExcelPreview(admin, {
    kind: "ELECTRICAL",
    excelDate,
    fileName: "estado.xlsx",
    projectLoad,
    ignored: [],
    rows: rows.map((item, index) => ({ ...item, row: index + 2 })),
  });
  while (!(await applyExcelBatch(admin, importId)).done);
}

const searchItem = async (code: string) =>
  (await searchCables({ q: code })).items.find((item) => item.code === code)!;

describe("project load from the Excel", () => {
  it("is applied but never shown; the Excel of the day afterwards is", async () => {
    await prisma.cable.create({ data: { code: "ZZ-1" } });
    await applyExcel([row("ZZ-1"), row("ZZ-2")], "2026-11-15", true);

    const loaded = await prisma.cable.findUniqueOrThrow({ where: { code: "ZZ-1" } });
    expect(loaded.installationStatus).toBe("LAID");
    expect(await prisma.cableEvent.count({ where: { source: "PROJECT_LOAD" } })).toBe(2);
    expect((await listActivity({ origin: "all" })).total).toBe(0);
    const detail = await getCableDetail(loaded.id, { origin: "all" });
    expect(detail!.history).toEqual([]);
    expect(detail!.lastAction).toBeNull();
    // ZZ-2 no estaba en la web: lo creó el Excel y su ficha lo dice.
    expect(detail!.excelOnly).toBe(false);
    const created = await prisma.cable.findUniqueOrThrow({ where: { code: "ZZ-2" } });
    expect((await getCableDetail(created.id))!.excelOnly).toBe(true);
    expect((await searchItem("ZZ-1")).lastAction).toBeNull();
    expect((await searchItem("ZZ-2")).lastAction).toBeNull();

    await applyExcel([row("ZZ-1", { connectionStatus: "CONNECTED" })], "2026-11-16", false);

    expect((await listActivity({ origin: "excel" })).total).toBe(1);
    expect((await listActivity({})).total).toBe(0);
    const after = await getCableDetail(loaded.id, { origin: "excel" });
    expect(after!.history).toHaveLength(1);
    expect(after!.lastAction).toMatchObject({ action: "EXCEL_UPDATED", user: "Ada" });
    expect((await searchItem("ZZ-1")).lastAction).toBe("EXCEL_UPDATED");
  });
});
