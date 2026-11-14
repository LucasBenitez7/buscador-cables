import { describe, expect, it } from "vitest";
import { sectionFlags, trayLabels, traySection } from "../parse/drawing-marks";
import { readPdfPages } from "../pdf/read-pdf";
import { drawingSheet, type DrawingSheetSpec } from "../testing/fixtures";
import { makePdf } from "../testing/make-pdf";
import { extractProjectData } from "./extract";

// Hojas inventadas de 2384 × 1684 puntos (A1 apaisado), como las de los planos eléctricos.
const W = 2384;
const H = 1684;

async function pageOf(spec: DrawingSheetSpec) {
  for await (const page of readPdfPages(makePdf([drawingSheet(spec)]))) return page;
  throw new Error("Sin páginas");
}

describe("trayLabels", () => {
  it("tells a code drawn along a tray from a row of a table", async () => {
    const page = await pageOf({
      drawing: "EJ-ICO-DRW-0003",
      sheet: "05",
      trays: [
        // Escrito hacia arriba a lo largo de la bandeja, como en los planos de instrumentación.
        { code: "99UXA00K20101", x: 600, top: 900, angle: 90 },
        { code: "99UXA00L22036", x: 1200, top: 300 },
      ],
      tables: [{ x: 300, top: 1200, sections: [["014", ["99UXA00L21014", "99UXA00L22014"]]] }],
    });
    const labels = trayLabels(page);
    const byCode = new Map(labels.map((label) => [label.code, label]));

    expect(byCode.get("99UXA00K20101")).toMatchObject({ inTable: false });
    expect(byCode.get("99UXA00L22036")).toMatchObject({ inTable: false });
    expect(byCode.get("99UXA00L21014")).toMatchObject({ inTable: true });
    expect(byCode.get("99UXA00L22014")).toMatchObject({ inTable: true });
    // Rotated text: its centre is above the baseline, a fraction of the sheet.
    const rotated = byCode.get("99UXA00K20101")!;
    expect(rotated.x).toBeCloseTo((600 - 5) / W, 2);
    expect(rotated.y).toBeLessThan((900 + 10) / H);
  });
});

describe("trayLabels: width before the code", () => {
  // Regresión: "U 600 99UXA01L10011" en un plano de instrumentación se tomaba por una tabla
  // de una fila (un número de tres cifras a la izquierda), y la bandeja perdía su marca.
  it("does not take the tray width for a table section", async () => {
    const page = await pageOf({
      drawing: "EJ-ICO-DRW-0003",
      sheet: "05",
      trays: [{ code: "99UXA01L10011", x: 900, top: 600 }],
      flags: [{ section: "600", x: 860, top: 600 }],
    });

    expect(trayLabels(page)[0]).toMatchObject({ code: "99UXA01L10011", inTable: false });
  });

  it("keeps the size of the code, upright when the text is", async () => {
    const page = await pageOf({
      drawing: "EJ-ICO-DRW-0003",
      sheet: "05",
      trays: [
        { code: "99UXA01L10011", x: 900, top: 600 },
        { code: "99UXA01L10012", x: 300, top: 1200, angle: 90 },
      ],
    });
    const [flat, upright] = trayLabels(page);

    expect(flat!.w).toBeGreaterThan(flat!.h * 2);
    expect(upright!.h).toBeGreaterThan(upright!.w * 2);
  });
});

describe("sectionFlags", () => {
  it("keeps the flags on the plan and leaves out table sections and the frame", async () => {
    const page = await pageOf({
      drawing: "EJ-ELE-DRW-0024",
      sheet: "02",
      flags: [
        { section: "015", x: 1200, top: 260 },
        // Número del marco de la hoja: fuera.
        { section: "110", x: 10, top: 800 },
      ],
      tables: [{ x: 300, top: 1200, sections: [["015", ["99UXA00L40015", "99UXA00L41015"]]] }],
    });

    expect(sectionFlags(page)).toEqual([
      {
        section: "015",
        x: expect.closeTo(1209 / W, 2),
        y: expect.closeTo(265 / H, 2),
        w: expect.closeTo(17 / W, 2),
        h: expect.closeTo(12 / H, 2),
      },
    ]);
  });

  it("reads the section of a tray from its code", () => {
    expect(traySection("80UBA00L21014")).toBe("014");
    expect(traySection("99UMC_1D20059")).toBe("059");
    expect(traySection("not a tray")).toBeNull();
  });
});

describe("extractProjectData: trays on the plans", () => {
  const extract = (sheets: DrawingSheetSpec[]) =>
    extractProjectData([{ name: "planos.pdf", data: makePdf(sheets.map(drawingSheet)) }]);

  it("marks a code drawn along the tray", async () => {
    const { trays, stats } = await extract([
      {
        drawing: "EJ-ICO-DRW-0003",
        sheet: "05",
        trays: [{ code: "99UXA00K20101", x: 600, top: 900, angle: 90 }],
      },
    ]);

    expect(trays[0]!.drawings).toEqual([
      expect.objectContaining({ sheet: "05", marks: [expect.objectContaining({ kind: "label" })] }),
    ]);
    expect(stats.trayMarks).toEqual({ label: 1, flag: 0, tableOnly: 0 });
  });

  it("points a tray listed in a table at the flag of its section on the same sheet", async () => {
    const { trays, stats } = await extract([
      {
        drawing: "EJ-ELE-DRW-0024",
        sheet: "02",
        flags: [{ section: "015", x: 1200, top: 260 }],
        tables: [{ x: 300, top: 1200, sections: [["015", ["99UXA00L40015", "99UXA00L41015"]]] }],
      },
    ]);
    const tray = trays.find((candidate) => candidate.code === "99UXA00L40015")!;

    expect(tray.drawings).toHaveLength(1);
    expect(tray.drawings[0]!.marks.map((mark) => mark.kind).sort()).toEqual(["flag", "table"]);
    expect(stats.trayMarks.flag).toBe(2);
  });

  it("looks for the flag on the other sheets of the drawing when the table is on its own sheet", async () => {
    const { trays, sheets } = await extract([
      // Planta con la bandera 014 de su propio nivel: su tabla define la 014, no vale.
      {
        drawing: "EJ-ELE-DRW-0024",
        sheet: "02",
        flags: [{ section: "014", x: 900, top: 400 }],
        tables: [{ x: 300, top: 1200, sections: [["014", ["99UXA00L40014"]]] }],
      },
      // Planta sin tablas con la bandera 014: es la de la hoja de tablas.
      { drawing: "EJ-ELE-DRW-0024", sheet: "03", flags: [{ section: "014", x: 700, top: 500 }] },
      // Hoja solo de tablas.
      {
        drawing: "EJ-ELE-DRW-0024",
        sheet: "04",
        tables: [{ x: 300, top: 300, sections: [["014", ["99UXA00L21014", "99UXA00L22014"]]] }],
      },
      // Otro plano con la misma bandera: no cuenta.
      { drawing: "EJ-ELE-DRW-0099", sheet: "01", flags: [{ section: "014", x: 700, top: 500 }] },
    ]);
    const tray = trays.find((candidate) => candidate.code === "99UXA00L21014")!;
    const bySheet = new Map(tray.drawings.map((entry) => [entry.sheet, entry]));

    expect([...bySheet.keys()].sort()).toEqual(["03", "04"]);
    expect(bySheet.get("03")!.marks).toEqual([
      expect.objectContaining({
        kind: "flag",
        x: expect.closeTo(709 / W, 2),
        y: expect.closeTo(505 / H, 2),
      }),
    ]);
    expect(bySheet.get("04")!.marks.map((mark) => mark.kind)).toEqual(["table"]);
    expect(sheets.map((sheet) => `${sheet.drawing}/${sheet.sheet}`)).toEqual([
      "EJ-ELE-DRW-0024/02",
      "EJ-ELE-DRW-0024/03",
      "EJ-ELE-DRW-0024/04",
      "EJ-ELE-DRW-0099/01",
    ]);
  });

  it("leaves a tray with only its table row when no sheet has its flag", async () => {
    const { trays, stats } = await extract([
      {
        drawing: "EJ-ELE-DRW-0030",
        sheet: "03",
        tables: [{ x: 300, top: 300, sections: [["001", ["99UZT_2D21029", "99UZT_2D20029"]]] }],
      },
    ]);

    expect(trays[0]!.drawings[0]!.marks.map((mark) => mark.kind)).toEqual(["table"]);
    expect(stats.trayMarks.tableOnly).toBe(2);
  });

  it("gives every sheet a fingerprint that changes with its text", async () => {
    const first = await extract([{ drawing: "EJ-ELE-DRW-0024", sheet: "02" }]);
    const same = await extract([{ drawing: "EJ-ELE-DRW-0024", sheet: "02" }]);
    const revised = await extract([
      { drawing: "EJ-ELE-DRW-0024", sheet: "02", flags: [{ section: "001", x: 900, top: 900 }] },
    ]);

    expect(first.sheets[0]!.fingerprint).toBe(same.sheets[0]!.fingerprint);
    expect(revised.sheets[0]!.fingerprint).not.toBe(first.sheets[0]!.fingerprint);
    expect(first.sheets[0]).toMatchObject({ width: W, height: H, page: 1, file: "planos.pdf" });
  });
});
