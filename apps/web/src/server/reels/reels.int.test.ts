import { randomUUID } from "node:crypto";
import { prisma } from "@cables/db";
import { permissionsOfRole, type ExcelReel, type ExcelReelPull, type Role } from "@cables/shared";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addExcelReelPullsPart,
  applyExcelBatch,
  finishExcelPreview,
  startExcelPreview,
} from "@/server/excel-import/service";
import { getReel, reelLinksOfCable, searchReels } from "./service";

// Datos inventados: ni bobinas, ni drums, ni cables del proyecto real.
type Actor = { id: string; role: Role; permissions: readonly string[] };

let supervisor: Actor;

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "reel_pull", "reel", "cable_discrepancy", "excel_import_row", "excel_import", "cable_event", "cable", "user" CASCADE',
  );
  const user = await prisma.user.create({
    data: { id: randomUUID(), name: "Supervisor", email: "s@cables.test", role: "SUPERVISOR" },
  });
  supervisor = { id: user.id, role: "SUPERVISOR", ...permissionsOfRole("SUPERVISOR") };
});

const reel = (values: Partial<ExcelReel>): ExcelReel => ({
  drum: null,
  tag: null,
  code: null,
  request: null,
  description: null,
  voltage: null,
  pickedUpOn: null,
  receivedM: null,
  usedM: null,
  remainingM: null,
  pulls: null,
  pendingPulls: null,
  pendingM: null,
  otherM: null,
  deliveredOn: null,
  deliveredM: null,
  tracked: true,
  pieces: null,
  ...values,
});

const pull = (values: Partial<ExcelReelPull> & { code: string }): ExcelReelPull => ({
  row: 2,
  conductor: null,
  circuit: null,
  tag: null,
  drum: null,
  startM: null,
  endM: null,
  pulledM: null,
  pulledOn: null,
  ...values,
});

type Upload = {
  kind?: "ELECTRICAL" | "INSTRUMENTATION";
  excelDate?: string;
  reels: ExcelReel[] | null;
  pulls: ExcelReelPull[] | null;
};

/** An Excel of the day with no cable rows, only its reels: sent, prepared and applied. */
async function upload({ kind = "ELECTRICAL", excelDate = "2026-11-16", reels, pulls }: Upload) {
  const importId = await startExcelPreview(supervisor, {
    kind,
    excelDate,
    fileName: "estado.xlsx",
    rowCount: 0,
    reels,
    reelPullCount: pulls === null ? null : pulls.length,
  });
  if (pulls && pulls.length > 0) await addExcelReelPullsPart(supervisor, { importId, pulls });
  await finishExcelPreview(supervisor, importId);
  for (;;) if ((await applyExcelBatch(supervisor, importId)).done) return importId;
}

const reelOf = (kind: "ELECTRICAL" | "INSTRUMENTATION", key: string) =>
  prisma.reel.findUniqueOrThrow({ where: { kind_key: { kind, key } } });

describe("reels of the Excel of the day", () => {
  it("are saved when the Excel is applied, not before", async () => {
    const importId = await startExcelPreview(supervisor, {
      kind: "ELECTRICAL",
      excelDate: "2026-11-16",
      fileName: "estado.xlsx",
      rowCount: 0,
      reels: [reel({ tag: "26", receivedM: 504, usedM: 407, remainingM: 94 })],
      reelPullCount: 1,
    });
    await addExcelReelPullsPart(supervisor, {
      importId,
      pulls: [pull({ code: "99XAA01W001", tag: "26", pulledM: 48 })],
    });
    await finishExcelPreview(supervisor, importId);
    expect(await prisma.reel.count()).toBe(0);
    expect((await searchReels({})).total).toBe(0);

    await applyExcelBatch(supervisor, importId);

    expect(await reelOf("ELECTRICAL", "T:26")).toMatchObject({ tag: "26", importId });
    expect((await searchReels({})).items).toMatchObject([
      { tag: "26", figures: { receivedM: 504, usedM: 407, remainingM: 94, source: "excel" } },
    ]);
  });

  it("checks that every pulling arrives, no more and no fewer", async () => {
    const importId = await startExcelPreview(supervisor, {
      kind: "ELECTRICAL",
      excelDate: "2026-11-16",
      fileName: "estado.xlsx",
      rowCount: 0,
      reels: [],
      reelPullCount: 2,
    });
    const part = { importId, pulls: [pull({ code: "99XAA01W001", tag: "26" })] };
    await addExcelReelPullsPart(supervisor, part);

    await expect(finishExcelPreview(supervisor, importId)).rejects.toThrow("todas las tiradas");
    await addExcelReelPullsPart(supervisor, part);
    await expect(addExcelReelPullsPart(supervisor, part)).rejects.toThrow("más tiradas");
    await expect(finishExcelPreview(supervisor, importId)).resolves.toMatchObject({ importId });
  });

  it("needs the import permission to send pullings", async () => {
    const importId = await startExcelPreview(supervisor, {
      kind: "ELECTRICAL",
      excelDate: "2026-11-16",
      fileName: "estado.xlsx",
      rowCount: 0,
      reelPullCount: 1,
    });
    const viewer = { id: supervisor.id, role: "VIEWER" as Role, permissions: [] };

    await expect(
      addExcelReelPullsPart(viewer, { importId, pulls: [pull({ code: "99X", tag: "1" })] }),
    ).rejects.toThrow("permiso");
    await expect(
      addExcelReelPullsPart(supervisor, { importId, pulls: [pull({ code: "99X" })] }),
    ).rejects.toThrow("Tirada sin bobina");
  });

  it("replace the ones of their kind, keeping each reel's link, and the old pullings go", async () => {
    await upload({
      reels: [reel({ tag: "26", usedM: 100 }), reel({ tag: "27" })],
      pulls: [pull({ code: "99XAA01W001", tag: "26", pulledM: 100 })],
    });
    await upload({
      kind: "INSTRUMENTATION",
      reels: [reel({ drum: "EJ0001", tag: "1" })],
      pulls: [pull({ code: "99XAB01-W8001", tag: "1", drum: "EJ0001", pulledM: 5 })],
    });
    const before = await reelOf("ELECTRICAL", "T:26");

    await upload({
      excelDate: "2026-11-17",
      reels: [reel({ tag: "26", usedM: 150 }), reel({ tag: "28" })],
      pulls: [
        pull({ code: "99XAA01W001", tag: "26", pulledM: 100 }),
        pull({ row: 3, code: "99XAA02W001", tag: "26", pulledM: 50 }),
      ],
    });

    const after = await reelOf("ELECTRICAL", "T:26");
    expect(after.id).toBe(before.id);
    expect(Number(after.usedM)).toBe(150);
    expect(
      (await prisma.reel.findMany({ where: { kind: "ELECTRICAL" }, orderBy: { key: "asc" } })).map(
        (item) => item.key,
      ),
    ).toEqual(["T:26", "T:28"]);
    expect(await prisma.reelPull.count({ where: { kind: "ELECTRICAL" } })).toBe(2);
    // Las de instrumentación no se tocan.
    expect(await prisma.reel.count({ where: { kind: "INSTRUMENTATION" } })).toBe(1);
    expect(await prisma.reelPull.count({ where: { kind: "INSTRUMENTATION" } })).toBe(1);
  });

  it("stay as they were when an Excel does not bring their sheets", async () => {
    await upload({
      reels: [reel({ tag: "26" })],
      pulls: [pull({ code: "99XAA01W001", tag: "26", pulledM: 100 })],
    });

    await upload({ excelDate: "2026-11-17", reels: null, pulls: null });

    expect(await prisma.reel.count()).toBe(1);
    expect(await prisma.reelPull.count()).toBe(1);
  });

  it("do not stop the Excel when a preview saved them in an older format", async () => {
    await upload({ reels: [reel({ tag: "26" })], pulls: null });
    const importId = await startExcelPreview(supervisor, {
      kind: "ELECTRICAL",
      excelDate: "2026-11-17",
      fileName: "estado.xlsx",
      rowCount: 0,
      reels: [reel({ tag: "99" })],
    });
    await finishExcelPreview(supervisor, importId);
    await prisma.excelImport.update({
      where: { id: importId },
      data: { reels: [{ tag: 99, unknown: true }] },
    });

    await expect(applyExcelBatch(supervisor, importId)).resolves.toMatchObject({ done: true });
    expect((await prisma.reel.findMany()).map((item) => item.key)).toEqual(["T:26"]);
  });
});

describe("searchReels and getReel", () => {
  async function project() {
    // Un circuito en dos tramos, con 3 cables en paralelo cada uno, y su copia sin tramo.
    for (const code of ["99XAA01W001.1", "99XAA01W001.2"]) {
      await prisma.cable.create({
        data: {
          code,
          level: "L3",
          installationStatus: "LAID",
          cablesPerCircuit: 3,
          lengthM: 50,
        },
      });
    }
    await prisma.cable.create({
      data: {
        code: "99XAA05W001",
        level: "L2",
        installationStatus: "NOT_LAID",
        plannedReel: "26",
        lengthM: 30,
        cablesPerCircuit: 3,
      },
    });
    await prisma.cable.create({
      data: {
        code: "99XAB01-W8001",
        level: "L1",
        installationStatus: "NOT_LAID",
        plannedReel: "EJ0003A",
        lengthM: 20,
      },
    });
    await upload({
      reels: [
        reel({
          tag: "26",
          request: "EJ-DRUM 10",
          receivedM: 504,
          usedM: 407,
          remainingM: 94,
          pulls: 2,
        }),
        reel({ tag: "126", request: "EJ-DRUM 26", receivedM: 300, usedM: 300, remainingM: 0 }),
        reel({ tag: "33", receivedM: 500, usedM: 542, remainingM: -42 }),
        // Sin seguimiento: sus cifras salen de sus tiradas.
        reel({ tag: "157", tracked: false, pieces: 1, receivedM: 649, description: "EJ 5x16" }),
      ],
      pulls: [
        pull({
          code: "99XAA01W001",
          conductor: "99XAA01W001T2C1",
          circuit: 2,
          tag: "26",
          pulledM: 48,
          pulledOn: "2026-07-24",
          startM: 239,
          endM: 191,
        }),
        // Un tramo que la web no tiene: no se lleva a otro.
        pull({
          row: 3,
          code: "99XAA01W001",
          conductor: "99XAA01W001T5C1",
          circuit: 5,
          tag: "26",
          pulledM: 23,
        }),
        pull({ row: 4, code: "99XAA09W001", tag: "157", pulledM: 100 }),
        pull({ row: 5, code: "99XAA10W001", tag: "157", pulledM: 49.5 }),
      ],
    });
    await upload({
      kind: "INSTRUMENTATION",
      reels: [
        reel({ drum: "EJ0003", tag: "3", receivedM: 1000, usedM: 0, remainingM: 1000 }),
        reel({ drum: "EJ0003", tag: "3B", receivedM: 1000, usedM: 0, remainingM: 1000 }),
      ],
      pulls: [],
    });
  }

  it("finds a reel by any of its names, the exact one first", async () => {
    await project();

    expect((await searchReels({ q: "26" })).items.map((item) => item.tag)).toEqual(["26", "126"]);
    expect((await searchReels({ q: "drum 10" })).items.map((item) => item.tag)).toEqual(["26"]);
    expect((await searchReels({ q: "5X16" })).items.map((item) => item.tag)).toEqual(["157"]);
  });

  it("filters by file and by what is left, and sorts by it", async () => {
    await project();

    expect((await searchReels({ kind: "INSTRUMENTATION" })).total).toBe(2);
    expect((await searchReels({ state: "review" })).items.map((item) => item.tag)).toEqual(["33"]);
    expect((await searchReels({ state: "empty" })).items.map((item) => item.tag)).toEqual(["126"]);
    expect(
      (await searchReels({ kind: "ELECTRICAL", sort: "remaining-asc" })).items.map(
        (item) => item.tag,
      ),
    ).toEqual(["33", "126", "26", "157"]);
    const pages = await searchReels({ size: 50, page: 9 });
    expect(pages).toMatchObject({ page: 1, pageCount: 1, total: 6 });
  });

  it("works out the figures of a reel the follow-up does not track from its pullings", async () => {
    await project();

    const untracked = (await searchReels({ q: "157" })).items[0]!;
    expect(untracked.figures).toEqual({
      receivedM: 649,
      usedM: 149.5,
      remainingM: 499.5,
      pulls: 2,
      pendingPulls: 0,
      pendingM: 0,
      source: "pulls",
    });
  });

  it("shows each pulling with its section, and the cables still to pull", async () => {
    await project();
    const id = (await reelOf("ELECTRICAL", "T:26")).id;

    const detail = (await getReel(id))!;

    expect(detail.figures).toMatchObject({ pulls: 2, usedM: 407, source: "excel" });
    expect(detail.totals).toMatchObject({ pulls: 2, usedM: 71, pendingPulls: 3, pendingM: 90 });
    expect(detail.pulls.map((item) => [item.conductor, item.cable?.code ?? null])).toEqual([
      ["99XAA01W001T2C1", "99XAA01W001.2"],
      ["99XAA01W001T5C1", null],
    ]);
    expect(detail.pending.map((item) => [item.cable.code, item.pulls, item.metres])).toEqual([
      ["99XAA05W001", 3, 90],
    ]);
    expect(await getReel("no-existe")).toBeNull();
  });

  it("says which reels share a drum, and gives a planned piece to both", async () => {
    await project();
    const three = await reelOf("INSTRUMENTATION", "EJ0003|3");
    const threeB = await reelOf("INSTRUMENTATION", "EJ0003|3B");

    const detail = (await getReel(three.id))!;

    expect(detail.sameDrum).toEqual([{ id: threeB.id, tag: "3B" }]);
    expect(detail.pending).toMatchObject([{ cable: { code: "99XAB01-W8001" }, sharedName: true }]);
    expect((await getReel(threeB.id))!.pending).toHaveLength(1);
  });

  it("links a cable to the reel of its pullings and to its planned one", async () => {
    await project();
    const cable = await prisma.cable.findUniqueOrThrow({ where: { code: "99XAA01W001.2" } });
    const pending = await prisma.cable.findUniqueOrThrow({ where: { code: "99XAA05W001" } });
    const reel26 = await reelOf("ELECTRICAL", "T:26");

    expect(await reelLinksOfCable({ ...cable, plannedReel: null })).toEqual({
      real: [{ id: reel26.id, label: "26 · EJ-DRUM 10" }],
      planned: [],
    });
    expect(await reelLinksOfCable(pending)).toEqual({
      real: [],
      planned: [{ id: reel26.id, label: "26 · EJ-DRUM 10" }],
    });
    // El tramo 1 no tiene tiradas: ninguna bobina real.
    const first = await prisma.cable.findUniqueOrThrow({ where: { code: "99XAA01W001.1" } });
    expect(await reelLinksOfCable(first)).toEqual({ real: [], planned: [] });
  });
});
