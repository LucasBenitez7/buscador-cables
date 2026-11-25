import { randomUUID } from "node:crypto";
import { prisma } from "@cables/db";
import { permissionsOfRole, type ExcelStatusRow, type Role } from "@cables/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  countNewDiscrepancies,
  countOpenDiscrepancies,
  decideDiscrepancies,
  decideDiscrepancy,
  listDiscrepancies,
  markDiscrepanciesSeen,
} from "./discrepancies";
import { applyExcelBatch, createExcelPreview } from "./service";

// Datos inventados.
type Actor = { id: string; role: Role; permissions: readonly string[] };
let supervisor: Actor;
let technician: Actor;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "cable_discrepancy", "excel_import_row", "excel_import", "cable_event", "cable", "company", "tray", "user" CASCADE',
  );
  const people = await Promise.all(
    (["SUPERVISOR", "TECHNICIAN"] as const).map((role) =>
      prisma.user.create({
        data: {
          id: randomUUID(),
          name: role === "SUPERVISOR" ? "Sara" : "Tomás",
          email: `${role}@cables.test`,
          role,
        },
      }),
    ),
  );
  [supervisor, technician] = people.map((user) => ({
    id: user.id,
    role: user.role as Role,
    ...permissionsOfRole(user.role as Role),
  })) as [Actor, Actor];
});

const notLaid = (code: string): ExcelStatusRow => ({
  row: 2,
  code,
  installationStatus: "NOT_LAID",
  connectionStatus: "DISCONNECTED",
  laidOn: null,
  company: null,
  reel: null,
  plannedReel: null,
  reelStatus: null,
  actualLengthTotalM: null,
  sections: null,
  actualLengthM: null,
});

async function applyExcel(rows: ExcelStatusRow[], excelDate: string) {
  const { importId, counts } = await createExcelPreview(supervisor, {
    kind: "ELECTRICAL",
    excelDate,
    fileName: "estado.xlsx",
    ignored: [],
    rows,
  });
  while (!(await applyExcelBatch(supervisor, importId)).done);
  return counts;
}

/** A cable a technician laid on the 12th, which the Excel of the 16th says is not laid. */
async function contradicted(code = "ZZ-1") {
  const cable = await prisma.cable.create({ data: { code, installationStatus: "LAID" } });
  const mark = await prisma.cableEvent.create({
    data: {
      cableId: cable.id,
      userId: technician.id,
      action: "LAID",
      changes: { installationStatus: { from: "NOT_LAID", to: "LAID" } },
      createdAt: new Date("2026-11-12T09:00:00Z"),
    },
  });
  await applyExcel([notLaid(code)], "2026-11-16");
  const discrepancy = await prisma.cableDiscrepancy.findFirstOrThrow({
    where: { cableId: cable.id },
  });
  return { cable, mark, discrepancy };
}

describe("listDiscrepancies", () => {
  it("lists the pending ones with who marked the web and the date of the Excel", async () => {
    await contradicted();

    expect(await countOpenDiscrepancies()).toBe(1);
    const list = await listDiscrepancies({});
    expect(list).toMatchObject({ total: 1, open: 1, decided: 0, page: 1, pageCount: 1 });
    expect(list.items[0]).toMatchObject({
      cable: { code: "ZZ-1" },
      web: "Tendido",
      webBefore: null,
      webBy: "Tomás",
      webAt: "12/11/26, 10:00",
      excel: "No tendido",
      excelDay: "16/11/2026",
      agreesOn: null,
      decision: null,
    });
    expect((await listDiscrepancies({ view: "decided" })).items).toEqual([]);
  });
});

describe("decideDiscrepancy", () => {
  it("accepts the Excel: the cable takes its state and the history says what it corrects", async () => {
    const { cable, mark, discrepancy } = await contradicted();

    const message = await decideDiscrepancy(supervisor, {
      id: discrepancy.id,
      decision: "ACCEPT_EXCEL",
    });

    expect(message).toBe("ZZ-1: aceptado lo del Excel del 16/11/2026.");
    const after = await prisma.cable.findUniqueOrThrow({ where: { id: cable.id } });
    expect(after).toMatchObject({
      installationStatus: "NOT_LAID",
      lastAction: "EXCEL_REVIEWED",
      lastActionById: supervisor.id,
      lastActionSource: "APP",
    });
    const event = await prisma.cableEvent.findFirstOrThrow({ where: { action: "EXCEL_REVIEWED" } });
    expect(event).toMatchObject({
      userId: supervisor.id,
      correctsEventId: mark.id,
      notes: "Aceptó lo del Excel del 16/11/2026.",
      changes: { installationStatus: { from: "LAID", to: "NOT_LAID" } },
    });
    expect(
      await prisma.cableDiscrepancy.findUniqueOrThrow({ where: { id: discrepancy.id } }),
    ).toMatchObject({
      status: "ACCEPTED_EXCEL",
      decidedById: supervisor.id,
      decisionEventId: event.id,
    });
    expect((await listDiscrepancies({ view: "decided" })).items[0]!.decision).toMatchObject({
      kind: "ACCEPT_EXCEL",
      by: "Sara",
    });

    // El estado queda en manos del Excel: el siguiente lo cambia sin discrepancia.
    const next = await applyExcel(
      [{ ...notLaid("ZZ-1"), installationStatus: "LAID" }],
      "2026-11-25",
    );
    expect(next).toEqual({ changes: 1, created: 0, discrepancies: 0 });
  });

  it("keeps the web: nothing changes and it counts as a person's mark of that day", async () => {
    const { cable, discrepancy } = await contradicted();

    await decideDiscrepancy(supervisor, { id: discrepancy.id, decision: "KEEP_WEB" });

    const after = await prisma.cable.findUniqueOrThrow({ where: { id: cable.id } });
    expect(after.installationStatus).toBe("LAID");
    const event = await prisma.cableEvent.findFirstOrThrow({ where: { action: "EXCEL_REVIEWED" } });
    expect(event).toMatchObject({
      changes: {},
      correctsEventId: null,
      notes: "Mantuvo lo de la web frente al Excel del 16/11/2026.",
    });

    // Un Excel anterior a la decisión ya no la reabre; uno de después que la contradiga, sí.
    expect(await applyExcel([notLaid("ZZ-1")], "2026-11-17")).toMatchObject({ discrepancies: 0 });
    const decidedOn = new Date();
    const later = new Date(decidedOn.getTime() + 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    expect(await applyExcel([notLaid("ZZ-1")], later)).toMatchObject({ discrepancies: 1 });
    expect(await countOpenDiscrepancies()).toBe(1);
  });

  it("is decided once, by whoever can correct movements", async () => {
    const { discrepancy } = await contradicted();

    await expect(
      decideDiscrepancy(technician, { id: discrepancy.id, decision: "KEEP_WEB" }),
    ).rejects.toThrow("No tienes permiso");
    await expect(
      decideDiscrepancy(supervisor, { id: discrepancy.id, decision: "MAYBE" }),
    ).rejects.toThrow("Decisión no válida");
    await decideDiscrepancy(supervisor, { id: discrepancy.id, decision: "KEEP_WEB" });
    await expect(
      decideDiscrepancy(supervisor, { id: discrepancy.id, decision: "ACCEPT_EXCEL" }),
    ).rejects.toThrow("ya ha decidido");
    await expect(
      decideDiscrepancy(supervisor, { id: "nope", decision: "KEEP_WEB" }),
    ).rejects.toThrow("no existe");
  });

  it("refuses to accept the Excel on a cable removed in the web, and keeping it touches nothing", async () => {
    const { cable, discrepancy } = await contradicted();
    await prisma.cable.update({ where: { id: cable.id }, data: { deletedAt: new Date() } });

    await expect(
      decideDiscrepancy(supervisor, { id: discrepancy.id, decision: "ACCEPT_EXCEL" }),
    ).rejects.toThrow("dado de baja");
    await decideDiscrepancy(supervisor, { id: discrepancy.id, decision: "KEEP_WEB" });

    expect(await prisma.cable.findUniqueOrThrow({ where: { id: cable.id } })).toMatchObject({
      version: cable.version,
      lastAction: null,
    });
    expect(await prisma.cableEvent.count({ where: { action: "EXCEL_REVIEWED" } })).toBe(0);
    expect(
      await prisma.cableDiscrepancy.findUniqueOrThrow({ where: { id: discrepancy.id } }),
    ).toMatchObject({ status: "KEPT_WEB", decisionEventId: null });
  });

  it("shows the state the cable has now when somebody changed it after the discrepancy", async () => {
    const { cable, discrepancy } = await contradicted();
    await prisma.cable.update({
      where: { id: cable.id },
      data: { connectionStatus: "CONNECTED", version: { increment: 1 } },
    });

    expect((await listDiscrepancies({})).items[0]).toMatchObject({
      web: "Tendido · Conectado",
      webBefore: "Tendido",
    });
    // Con «Seleccionar todas» no se acepta sin mirarla; desde su tarjeta, sí.
    const all = await decideDiscrepancies(supervisor, { all: true, decision: "ACCEPT_EXCEL" });
    expect(all.decided).toBe(0);
    expect(all.failed[0]!.message).toContain("cambió en la web después");
    await decideDiscrepancy(supervisor, { id: discrepancy.id, decision: "ACCEPT_EXCEL" });
    expect(await prisma.cable.findUniqueOrThrow({ where: { id: cable.id } })).toMatchObject({
      installationStatus: "NOT_LAID",
      connectionStatus: "DISCONNECTED",
    });
  });
});

describe("new since the last visit", () => {
  it("warns only about what came after opening «Pendientes de revisar»", async () => {
    await contradicted("ZZ-1");
    expect(await countNewDiscrepancies(supervisor.id)).toBe(1);

    await markDiscrepanciesSeen(supervisor.id);
    expect(await countNewDiscrepancies(supervisor.id)).toBe(0);
    // Sigue pendiente para todos; y otra persona que no la ha visto aún la tiene como nueva.
    expect(await countOpenDiscrepancies()).toBe(1);
    expect(await countNewDiscrepancies(technician.id)).toBe(1);

    await contradicted("ZZ-2");
    expect(await countNewDiscrepancies(supervisor.id)).toBe(1);
  });

  it("does not warn again when a later Excel contradicts or agrees with a pending one", async () => {
    await contradicted("ZZ-1");
    expect(await markDiscrepanciesSeen(supervisor.id)).toBe(true);
    expect(await markDiscrepanciesSeen(supervisor.id)).toBe(false);

    // El Excel del día siguiente dice lo mismo: sigue pendiente, pero no es nueva.
    await applyExcel([notLaid("ZZ-1")], "2026-11-17");
    expect(await countNewDiscrepancies(supervisor.id)).toBe(0);
    // Y el siguiente ya coincide con la web: solo se avisa en la tarjeta.
    await applyExcel([{ ...notLaid("ZZ-1"), installationStatus: "LAID" }], "2026-11-18");
    expect(await countNewDiscrepancies(supervisor.id)).toBe(0);
    expect((await listDiscrepancies({})).items[0]!.agreesOn).toBe("18/11/2026");
  });
});

describe("decideDiscrepancies", () => {
  it("decides the ticked ones, each with its own event", async () => {
    const one = await contradicted("ZZ-1");
    const two = await contradicted("ZZ-2");
    await contradicted("ZZ-3");

    const result = await decideDiscrepancies(supervisor, {
      ids: [one.discrepancy.id, two.discrepancy.id],
      decision: "ACCEPT_EXCEL",
    });

    expect(result).toEqual({ decided: 2, failed: [], remaining: 0 });
    expect(await countOpenDiscrepancies()).toBe(1);
    expect(await prisma.cableEvent.count({ where: { action: "EXCEL_REVIEWED" } })).toBe(2);
  });

  it("decides every pending one, and reports the ones it could not", async () => {
    await contradicted("ZZ-1");
    const removed = await contradicted("ZZ-2");
    await prisma.cable.update({ where: { id: removed.cable.id }, data: { deletedAt: new Date() } });

    const result = await decideDiscrepancies(supervisor, { all: true, decision: "ACCEPT_EXCEL" });

    expect(result.decided).toBe(1);
    expect(result.failed).toEqual([
      { id: removed.discrepancy.id, code: "ZZ-2", message: "El cable ZZ-2 está dado de baja." },
    ]);
    expect(result.remaining).toBe(0);
    await expect(decideDiscrepancies(supervisor, { decision: "KEEP_WEB" })).rejects.toThrow(
      "Elige qué discrepancias",
    );
    await expect(
      decideDiscrepancies(technician, { all: true, decision: "KEEP_WEB" }),
    ).rejects.toThrow("No tienes permiso");
  });
});
