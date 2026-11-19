import { randomUUID } from "node:crypto";
import { prisma } from "@cables/db";
import {
  EXCEL_APPLY_BATCH,
  permissionsOfRole,
  type ExcelStatusRow,
  type Role,
} from "@cables/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ExcelImportError,
  addExcelPreviewPart,
  applyExcelBatch,
  createExcelPreview,
  discardExcelPreview,
  finishExcelPreview,
  setExcelRowsSelected,
  startExcelPreview,
} from "./service";

// Datos inventados: ni códigos, ni empresas, ni bobinas del proyecto real.
type Actor = { id: string; role: Role; permissions: readonly string[] };

let admin: Actor;
let supervisor: Actor;
let technician: Actor;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "cable_discrepancy", "excel_import_row", "excel_import", "cable_event", "cable", "company", "tray", "user" CASCADE',
  );
  const people = await Promise.all(
    (["ADMIN", "SUPERVISOR", "TECHNICIAN"] as const).map((role) =>
      prisma.user.create({
        data: { id: randomUUID(), name: role, email: `${role}@cables.test`, role },
      }),
    ),
  );
  [admin, supervisor, technician] = people.map((user) => ({
    id: user.id,
    role: user.role as Role,
    ...permissionsOfRole(user.role as Role),
  })) as [Actor, Actor, Actor];
});

const row = (code: string, overrides: Partial<ExcelStatusRow> = {}): ExcelStatusRow => ({
  row: 2,
  code,
  installationStatus: "LAID",
  connectionStatus: "CONNECTED",
  laidOn: "2026-11-10",
  company: "Montajes Ficticios",
  reel: "B-01",
  reelStatus: "En obra",
  actualLengthTotalM: 80,
  sections: 2,
  actualLengthM: 40,
  ...overrides,
});

const input = (rows: ExcelStatusRow[], overrides: Record<string, unknown> = {}) => ({
  kind: "ELECTRICAL",
  excelDate: "2026-11-16",
  fileName: "estado-electrico_16.11.26.xlsx",
  ignored: [],
  rows: rows.map((item, index) => ({ ...item, row: index + 2 })),
  ...overrides,
});

const newCable = (code: string, data: Record<string, unknown> = {}) =>
  prisma.cable.create({ data: { code, installationStatus: "NOT_LAID", ...data } });

/** A person marked the cable laid in the web at a given moment. */
async function markedLaid(cableId: string, at: string) {
  await prisma.cable.update({ where: { id: cableId }, data: { installationStatus: "LAID" } });
  return prisma.cableEvent.create({
    data: {
      cableId,
      userId: technician.id,
      action: "LAID",
      changes: { installationStatus: { from: "NOT_LAID", to: "LAID" } },
      createdAt: new Date(at),
    },
  });
}

async function applyAll(actor: Actor, importId: string) {
  let batches = 0;
  for (;;) {
    batches += 1;
    const result = await applyExcelBatch(actor, importId);
    if (result.done) return batches;
  }
}

const cableOf = (code: string) =>
  prisma.cable.findUniqueOrThrow({ where: { code }, include: { company: true } });

describe("createExcelPreview", () => {
  it("needs the import permission, and the project load needs an administrator", async () => {
    await expect(createExcelPreview(technician, input([row("ZZ-1")]))).rejects.toThrow(
      ExcelImportError,
    );
    await expect(
      createExcelPreview(supervisor, input([row("ZZ-1")], { projectLoad: true })),
    ).rejects.toThrow("Solo un administrador");
  });

  it("refuses what the browser should never send", async () => {
    await expect(createExcelPreview(supervisor, input([row("ZZ-1"), row("ZZ-1")]))).rejects.toThrow(
      "repetido",
    );
  });

  it("saves changes, new cables and discrepancies without touching any cable", async () => {
    const changed = await newCable("ZZ-1");
    const contradicted = await newCable("ZZ-2");
    const event = await markedLaid(contradicted.id, "2026-11-12T09:00:00Z");
    const newer = await newCable("ZZ-3");
    await markedLaid(newer.id, "2026-11-16T09:00:00Z");
    await newCable("ZZ-4", { deletedAt: new Date() });

    const summary = await createExcelPreview(
      supervisor,
      input([
        row("ZZ-1"),
        row("ZZ-2", { installationStatus: "NOT_LAID", connectionStatus: "DISCONNECTED" }),
        row("ZZ-3", {
          installationStatus: "NOT_LAID",
          connectionStatus: "DISCONNECTED",
          laidOn: null,
          company: null,
          reel: null,
          reelStatus: null,
          actualLengthTotalM: null,
          sections: null,
          actualLengthM: null,
        }),
        row("ZZ-4"),
        row("ZZ-5"),
      ]),
    );

    expect(summary.counts).toEqual({ changes: 1, created: 1, discrepancies: 1 });
    expect(summary.ignored).toBe(1);
    const rows = await prisma.excelImportRow.findMany({
      where: { importId: summary.importId },
      orderBy: { code: "asc" },
    });
    expect(rows.map((item) => [item.code, item.kind])).toEqual([
      ["ZZ-1", "CHANGE"],
      ["ZZ-2", "DISCREPANCY"],
      ["ZZ-5", "NEW"],
    ]);
    expect(rows[1]!.conflict).toMatchObject({ webEventId: event.id, discrepancyId: null });
    expect((await prisma.cable.findUniqueOrThrow({ where: { id: changed.id } })).version).toBe(1);
    expect(await prisma.cable.count({ where: { code: "ZZ-5" } })).toBe(0);
  });

  it("replaces the saved preview of the same kind, not the other one", async () => {
    const first = await createExcelPreview(supervisor, input([row("ZZ-1")]));
    const other = await createExcelPreview(
      supervisor,
      input(
        [
          row("ZZ-9", {
            connectionStatus: null,
            sections: null,
            actualLengthM: null,
            actualLengthTotalM: null,
          }),
        ],
        {
          kind: "INSTRUMENTATION",
        },
      ),
    );
    const second = await createExcelPreview(supervisor, input([row("ZZ-1")]));

    const statuses = await prisma.excelImport.findMany({ select: { id: true, status: true } });
    expect(Object.fromEntries(statuses.map((item) => [item.id, item.status]))).toEqual({
      [first.importId]: "DISCARDED",
      [other.importId]: "PREVIEW",
      [second.importId]: "PREVIEW",
    });
    await expect(applyExcelBatch(supervisor, first.importId)).rejects.toThrow("descartó");
  });
});

describe("upload in parts", () => {
  it("sends the rows in parts, and a half sent Excel cannot be applied", async () => {
    await newCable("ZZ-1");
    const importId = await startExcelPreview(supervisor, {
      kind: "ELECTRICAL",
      excelDate: "2026-11-16",
      fileName: "estado.xlsx",
      rowCount: 3,
    });
    await addExcelPreviewPart(supervisor, {
      importId,
      rows: [row("ZZ-1"), row("ZZ-2", { row: 3 })],
      ignored: [{ row: 4, code: "ZZ-3", reason: "Estado «Check»: no se usa" }],
    });

    await expect(applyExcelBatch(supervisor, importId)).rejects.toThrow("no ha llegado entero");
    await expect(finishExcelPreview(supervisor, importId)).rejects.toThrow("todas las filas");
    await expect(
      addExcelPreviewPart(admin, { importId, rows: [row("ZZ-4")], ignored: [] }),
    ).rejects.toThrow("ya no existe");
    await expect(
      addExcelPreviewPart(supervisor, { importId, rows: [row("ZZ-2")], ignored: [] }),
    ).rejects.toThrow("repetido");

    await addExcelPreviewPart(supervisor, { importId, rows: [row("ZZ-5")], ignored: [] });
    expect(await finishExcelPreview(supervisor, importId)).toEqual({
      importId,
      counts: { changes: 1, created: 2, discrepancies: 0 },
      ignored: 1,
    });
  });

  it("a new upload of the same kind replaces one left half sent", async () => {
    const half = await startExcelPreview(supervisor, {
      kind: "ELECTRICAL",
      excelDate: "2026-11-16",
      fileName: "estado.xlsx",
      rowCount: 2,
    });
    await createExcelPreview(supervisor, input([row("ZZ-1")]));

    await expect(
      addExcelPreviewPart(supervisor, { importId: half, rows: [row("ZZ-2")], ignored: [] }),
    ).rejects.toThrow("sustituido");
  });
});

describe("applyExcelBatch", () => {
  it("applies the changes, creates the new cables and keeps the web in a discrepancy", async () => {
    const tray = await prisma.tray.create({ data: { code: "ZZT01", kind: "LADDER" } });
    await newCable("ZZ-1", {
      installationStatus: "PARTIALLY_LAID",
      looseEnd: "ORIGIN",
      looseEndTrayId: tray.id,
    });
    const contradicted = await newCable("ZZ-2");
    await markedLaid(contradicted.id, "2026-11-12T09:00:00Z");
    const untouched = await newCable("ZZ-8");

    const { importId } = await createExcelPreview(
      supervisor,
      input([
        row("ZZ-1"),
        row("ZZ-2", { installationStatus: "NOT_LAID", connectionStatus: "DISCONNECTED" }),
        row("ZZ-5", { company: "montajes ficticios" }),
      ]),
    );
    expect(await applyAll(supervisor, importId)).toBe(1);

    const one = await cableOf("ZZ-1");
    expect(one).toMatchObject({
      installationStatus: "LAID",
      connectionStatus: "CONNECTED",
      looseEnd: null,
      looseEndTrayId: null,
      reel: "B-01",
      version: 2,
      lastAction: "EXCEL_UPDATED",
      lastActionSource: "EXCEL",
      lastActionById: supervisor.id,
    });
    expect(one.company?.name).toBe("Montajes Ficticios");
    expect(one.laidOn?.toISOString().slice(0, 10)).toBe("2026-11-10");
    expect(one.actualLengthM?.toNumber()).toBe(40);

    const two = await cableOf("ZZ-2");
    expect(two.installationStatus).toBe("LAID");
    expect(two.reel).toBe("B-01");
    const discrepancy = await prisma.cableDiscrepancy.findFirstOrThrow({
      where: { cableId: contradicted.id },
    });
    expect(discrepancy).toMatchObject({ status: "OPEN", importId, agreesOn: null });
    expect(discrepancy.excel).toEqual({
      installationStatus: "NOT_LAID",
      connectionStatus: "DISCONNECTED",
    });

    const created = await cableOf("ZZ-5");
    expect(created).toMatchObject({
      excelOnly: true,
      installationStatus: "LAID",
      lastAction: "CREATED",
    });
    expect(created.companyId).toBe(one.companyId);
    expect(await prisma.company.count()).toBe(1);

    const events = await prisma.cableEvent.findMany({ where: { excelImportId: importId } });
    expect(events).toHaveLength(3);
    expect(
      events.every((event) => event.source === "EXCEL" && event.userId === supervisor.id),
    ).toBe(true);
    expect((await prisma.cable.findUniqueOrThrow({ where: { id: untouched.id } })).version).toBe(1);
    expect(await prisma.excelImport.findUniqueOrThrow({ where: { id: importId } })).toMatchObject({
      status: "APPLIED",
    });
    await expect(applyExcelBatch(supervisor, importId)).rejects.toThrow("ya está aplicado");
    expect((await cableOf("ZZ-1")).version).toBe(2);
  });

  it("leaves out the unmarked rows, and they come back with the next Excel", async () => {
    await newCable("ZZ-1");
    await newCable("ZZ-2");
    const first = await createExcelPreview(supervisor, input([row("ZZ-1"), row("ZZ-2")]));
    const unmarked = await prisma.excelImportRow.findFirstOrThrow({
      where: { importId: first.importId, code: "ZZ-2" },
    });
    await setExcelRowsSelected(supervisor, {
      importId: first.importId,
      rowIds: [unmarked.id],
      selected: false,
    });
    await applyAll(supervisor, first.importId);

    expect((await cableOf("ZZ-1")).installationStatus).toBe("LAID");
    expect((await cableOf("ZZ-2")).installationStatus).toBe("NOT_LAID");
    await expect(
      setExcelRowsSelected(supervisor, { importId: first.importId, selected: true }),
    ).rejects.toThrow("no se puede cambiar");

    const next = await createExcelPreview(supervisor, input([row("ZZ-1"), row("ZZ-2")]));
    expect(next.counts).toEqual({ changes: 1, created: 0, discrepancies: 0 });
  });

  it("applies a big file in several batches", async () => {
    const rows = Array.from({ length: EXCEL_APPLY_BATCH + 1 }, (_, index) =>
      row(`ZZ-${1000 + index}`),
    );
    const { importId, counts } = await createExcelPreview(supervisor, input(rows));

    expect(counts.created).toBe(EXCEL_APPLY_BATCH + 1);
    expect(await applyExcelBatch(supervisor, importId)).toEqual({
      applied: EXCEL_APPLY_BATCH,
      remaining: 1,
      done: false,
    });
    expect((await prisma.excelImport.findUniqueOrThrow({ where: { id: importId } })).status).toBe(
      "APPLYING",
    );
    await expect(createExcelPreview(supervisor, input([row("ZZ-1")]))).rejects.toThrow(
      "Se está aplicando",
    );
    expect(await applyExcelBatch(supervisor, importId)).toEqual({
      applied: 1,
      remaining: 0,
      done: true,
    });
    expect(await prisma.cable.count({ where: { excelOnly: true } })).toBe(EXCEL_APPLY_BATCH + 1);
  });

  it("decides again at apply time: a person's mark after the preview wins", async () => {
    const cable = await newCable("ZZ-1");
    const { importId } = await createExcelPreview(
      supervisor,
      input([row("ZZ-1", { installationStatus: "NOT_LAID", connectionStatus: "DISCONNECTED" })], {
        excelDate: "2026-11-15",
      }),
    );
    // Una persona lo tiende después de la fecha del Excel: lo de la web es más nuevo.
    await markedLaid(cable.id, "2026-11-17T08:00:00Z");
    await applyAll(supervisor, importId);

    const after = await cableOf("ZZ-1");
    expect(after.installationStatus).toBe("LAID");
    expect(await prisma.cableDiscrepancy.count()).toBe(0);
  });

  it("does not take registering a cable by hand as a person's mark", async () => {
    // Regresión: el alta escribe su estado inicial y bloqueaba el estado del Excel.
    const cable = await newCable("ZZ-1");
    await prisma.cableEvent.create({
      data: {
        cableId: cable.id,
        userId: technician.id,
        action: "CREATED",
        changes: { installationStatus: { from: null, to: "NOT_LAID" } },
        createdAt: new Date("2026-11-18T09:00:00Z"),
      },
    });
    const { importId } = await createExcelPreview(supervisor, input([row("ZZ-1")]));
    await applyAll(supervisor, importId);

    expect(await cableOf("ZZ-1")).toMatchObject({
      installationStatus: "LAID",
      connectionStatus: "CONNECTED",
    });
  });

  it("never closes a discrepancy: a later Excel contradicts it again or only agrees", async () => {
    const cable = await newCable("ZZ-1");
    await markedLaid(cable.id, "2026-11-12T09:00:00Z");
    const notLaid = row("ZZ-1", {
      installationStatus: "NOT_LAID",
      connectionStatus: "DISCONNECTED",
    });

    const first = await createExcelPreview(supervisor, input([notLaid]));
    await applyAll(supervisor, first.importId);
    const again = await createExcelPreview(
      supervisor,
      input([notLaid], { excelDate: "2026-11-17" }),
    );
    expect(again.counts.discrepancies).toBe(1);
    await applyAll(supervisor, again.importId);

    const [discrepancy] = await prisma.cableDiscrepancy.findMany();
    expect(await prisma.cableDiscrepancy.count()).toBe(1);
    expect(discrepancy).toMatchObject({ importId: again.importId, status: "OPEN" });
    expect(discrepancy!.excelDate.toISOString().slice(0, 10)).toBe("2026-11-17");

    const agrees = await createExcelPreview(
      supervisor,
      input([row("ZZ-1", { connectionStatus: "DISCONNECTED" })], { excelDate: "2026-11-18" }),
    );
    await applyAll(supervisor, agrees.importId);
    const after = await prisma.cableDiscrepancy.findUniqueOrThrow({
      where: { id: discrepancy!.id },
    });
    expect(after.status).toBe("OPEN");
    expect(after.agreesOn?.toISOString().slice(0, 10)).toBe("2026-11-18");
    expect((await cableOf("ZZ-1")).installationStatus).toBe("LAID");
  });

  it("refuses an Excel older than the last one applied of its kind, not the same day", async () => {
    await newCable("ZZ-1");
    await applyAll(
      supervisor,
      (await createExcelPreview(supervisor, input([row("ZZ-1")]))).importId,
    );

    await expect(
      createExcelPreview(supervisor, input([row("ZZ-1")], { excelDate: "2026-11-15" })),
    ).rejects.toThrow("Ya se aplicó el Excel del 16/11/2026 de este tipo");
    // El mismo día (un archivo corregido) y el otro tipo de Excel, sí.
    await expect(createExcelPreview(supervisor, input([row("ZZ-1")]))).resolves.toBeDefined();
    await expect(
      createExcelPreview(
        supervisor,
        input([row("ZZ-1", { connectionStatus: null, sections: null })], {
          kind: "INSTRUMENTATION",
          excelDate: "2026-11-15",
        }),
      ),
    ).resolves.toBeDefined();
  });

  it("discards a preview without applying anything", async () => {
    await newCable("ZZ-1");
    const { importId } = await createExcelPreview(supervisor, input([row("ZZ-1")]));
    await discardExcelPreview(supervisor, importId);

    expect((await cableOf("ZZ-1")).version).toBe(1);
    await expect(applyExcelBatch(supervisor, importId)).rejects.toThrow("descartó");
  });
});

describe("project load", () => {
  it("states the truth without discrepancies and is not shown", async () => {
    const cable = await newCable("ZZ-1");
    await markedLaid(cable.id, "2026-11-12T09:00:00Z");
    const { importId, counts } = await createExcelPreview(
      admin,
      input([row("ZZ-1", { installationStatus: "NOT_LAID", connectionStatus: "DISCONNECTED" })], {
        projectLoad: true,
      }),
    );

    expect(counts).toEqual({ changes: 1, created: 0, discrepancies: 0 });
    await applyAll(admin, importId);
    expect(await cableOf("ZZ-1")).toMatchObject({
      installationStatus: "NOT_LAID",
      lastActionSource: "PROJECT_LOAD",
    });
    const event = await prisma.cableEvent.findFirstOrThrow({ where: { excelImportId: importId } });
    expect(event.source).toBe("PROJECT_LOAD");
  });

  it("is only the first one: not after a daily Excel of the same kind", async () => {
    await newCable("ZZ-1");
    const daily = await createExcelPreview(supervisor, input([row("ZZ-1")]));
    await applyAll(supervisor, daily.importId);

    await expect(
      createExcelPreview(admin, input([row("ZZ-1")], { projectLoad: true })),
    ).rejects.toThrow("solo la primera");
  });
});
