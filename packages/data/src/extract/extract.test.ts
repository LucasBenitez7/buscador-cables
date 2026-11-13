import { describe, expect, it } from "vitest";
import { coverPage, drawingSheet, instrumentSheet, powerSheet } from "../testing/fixtures";
import { makePdf } from "../testing/make-pdf";
import { extractProjectData } from "./extract";
import { compareRevisions, readLength, readRoute, type IssueDraft } from "./normalize";
import { formatReport } from "./report";

describe("readLength", () => {
  it("reads metres and pending lengths", () => {
    expect(readLength("142 m")).toEqual({ lengthM: 142, pending: false });
    expect(readLength("85 m (PEND.)")).toEqual({ lengthM: 85, pending: true });
    expect(readLength("25,5")).toEqual({ lengthM: 25.5, pending: false });
    expect(readLength(null)).toEqual({ lengthM: null, pending: false });
  });
});

describe("compareRevisions", () => {
  it("orders plain and RX revisions", () => {
    const sorted = ["3", "2_RX01", "1", "03_RX00", "2", "2_RX00"].sort(compareRevisions);
    expect(sorted).toEqual(["1", "2", "2_RX00", "2_RX01", "3", "03_RX00"]);
    expect(compareRevisions(null, "0")).toBeLessThan(0);
  });
});

describe("readRoute", () => {
  it("turns markers into sections and keeps what is not a tray as text", () => {
    const issues: IssueDraft[] = [];
    const steps = readRoute(
      [
        "FIELD_TRAY",
        "99UX_01L10002",
        "(NOTE 1)",
        "ROOM_TRAY",
        "99uxb01l10030",
        "99UXT_2D20028 (S)",
        "99USM00L2092",
      ],
      issues,
    );

    expect(steps).toEqual([
      { label: "99UX_01L10002", trayCode: "99UX_01L10002", section: "FIELD" },
      { label: "(NOTE 1)", trayCode: null, section: "FIELD" },
      { label: "99UXB01L10030", trayCode: "99UXB01L10030", section: "ROOM" },
      { label: "99UXT_2D20028 (S)", trayCode: "99UXT_2D20028", section: "ROOM" },
      { label: "99USM00L2092", trayCode: null, section: "ROOM" },
    ]);
    expect(issues).toEqual([
      {
        severity: "warning",
        message:
          '"99USM00L2092" parece una bandeja pero no sigue la codificación: se guarda como texto.',
      },
    ]);
  });
});

describe("extractProjectData", () => {
  const cableList = makePdf([
    coverPage(),
    powerSheet({
      code: "99XAT10W2005",
      revision: "2",
      length: "85 m (PEND.)",
      circuit: "1 de 2",
      perCircuit: "3",
      from: { equipment: "99BMA", functionKks: "=99BMA00GS101" },
      to: { equipment: "99XAT10AP001" },
      route: ["99UXA00L22036", "99UXA00L22051", "TRAM. VERTICAL"],
    }),
    // Same cable again, in a later revision: this one wins.
    powerSheet({
      code: "99XAT10W2005",
      revision: "3_RX00",
      length: "90 m",
      route: ["99UXA00L22036", "99UXA00L22051"],
    }),
    powerSheet({ code: "99XAT10W2006", level: "S2", length: "0 m", route: [] }),
    // Unreadable: the header and the footer do not agree.
    powerSheet({ code: "99XAT10W2007", footer: "99XAT10W2008" }),
    powerSheet({ code: "99XAT10W2009", level: "L9" }),
  ]);
  const instrumentList = makePdf([
    instrumentSheet({
      code: "99XAB10T1-W8001",
      route: ["FIELD_TRAY", "99UXA01L10002", "ROOM_TRAY", "99UXB01L10030"],
    }),
    instrumentSheet({
      code: "99XAB10T1-W8002",
      from: { equipment: "99XAB10CT002", gland: "M-20", location: "---" },
      to: { equipment: "99XAB10CX001", gland: "M-20", location: "99UYC14RA001" },
      route: ["FIELD_TRAY"],
    }),
  ]);
  const drawings = makePdf([
    drawingSheet({
      drawing: "EJ-ELE-DRW-0024",
      sheet: "00",
      index: [["02", "CABLE ROUTING DRAWINGS - MAIN ELECTRICAL BUILDING - FIRST FLOOR"]],
    }),
    drawingSheet({
      drawing: "EJ-ELE-DRW-0024",
      sheet: "02",
      trays: [
        { code: "99UXA00L22036", size: "L600100300" },
        { code: "99UXA00L22036", size: "L600100300", top: 900 },
        { code: "99UXA00L22036", size: "L400100300", top: 950 },
        { code: "99UXA01L10002" },
      ],
    }),
  ]);

  it("reads cables from any list and trays from the drawings, whatever the file order", async () => {
    const result = await extractProjectData([
      { name: "planos.pdf", data: drawings.slice() },
      { name: "instrumentacion.pdf", data: instrumentList.slice() },
      { name: "electrico.pdf", data: cableList.slice() },
    ]);

    expect(result.cables.map((cable) => cable.code).sort()).toEqual([
      "99XAB10T1-W8001",
      "99XAB10T1-W8002",
      "99XAT10W2005",
      "99XAT10W2006",
    ]);
    expect(result.stats.files).toEqual([
      { name: "planos.pdf", pages: 2, cableSheets: 0, drawingSheets: 2 },
      { name: "instrumentacion.pdf", pages: 2, cableSheets: 2, drawingSheets: 0 },
      { name: "electrico.pdf", pages: 6, cableSheets: 5, drawingSheets: 0 },
    ]);
    expect(result.stats.cablesByLevel).toEqual({ L1: 2, L2: 2 });
  });

  it("normalizes a power cable and keeps its highest revision", async () => {
    const { cables, issues } = await extractProjectData([
      { name: "electrico.pdf", data: cableList.slice() },
    ]);
    const cable = cables.find((candidate) => candidate.code === "99XAT10W2005");

    expect(cable).toMatchObject({
      level: "L2",
      revision: "3_RX00",
      lengthM: 90,
      lengthPending: false,
      typeCode: "Q0825",
      typeName: "0,6/1 KV 8X2.5 MM2 CU",
      conductors: 8,
      crossSectionMm2: 2.5,
      voltageRating: "0,6/1 kV",
      sourceFile: "electrico.pdf",
      sourcePage: 3,
      sourceDocument: "EJ-ELE-LST-0011",
      route: [
        { label: "99UXA00L22036", trayCode: "99UXA00L22036", section: null },
        { label: "99UXA00L22051", trayCode: "99UXA00L22051", section: null },
      ],
    });
    expect(issues).toContainEqual(
      expect.objectContaining({
        code: "99XAT10W2005",
        message:
          "Repetido: se usa esta revisión (3_RX00) en lugar de la de electrico.pdf pág. 2 (2).",
      }),
    );
  });

  it("reports what it guessed and leaves out what it cannot read", async () => {
    const { cables, issues } = await extractProjectData([
      { name: "electrico.pdf", data: cableList.slice() },
    ]);
    const messages = (code: string) =>
      issues
        .filter((issue) => issue.code === code)
        .map((issue) => `${issue.severity}: ${issue.message}`);

    expect(cables.find((cable) => cable.code === "99XAT10W2006")).toMatchObject({
      level: "L2",
      lengthM: null,
    });
    expect(messages("99XAT10W2006")).toEqual([
      'warning: Nivel "S2" cargado como L2.',
      'warning: Sin longitud en el listado ("0 m").',
    ]);
    expect(messages("99XAT10W2007")).toEqual([
      "error: El código de la cabecera (99XAT10W2007) no coincide con el del pie (99XAT10W2008).",
    ]);
    expect(messages("99XAT10W2009")).toEqual(['error: Nivel ilegible: "L9".']);
    expect(issues.find((issue) => issue.code === "99XAT10W2009")).toMatchObject({
      file: "electrico.pdf",
      page: 6,
    });
  });

  it("reads instrumentation ends, local cables and route sections", async () => {
    const { cables } = await extractProjectData([
      { name: "instrumentacion.pdf", data: instrumentList.slice() },
    ]);
    const [routed, local] = cables;

    expect(routed).toMatchObject({
      level: "L1",
      conductors: 8,
      crossSectionMm2: 0.5,
      diagram: "EJ-ICO-DIA-0100_010",
      origin: { equipment: "99XAB10CT001", gland: "M-20ARM", room: null },
      destination: { equipment: "99CXJ11", gland: "M-20", room: "99UXB23RA052" },
      route: [
        { label: "99UXA01L10002", trayCode: "99UXA01L10002", section: "FIELD" },
        { label: "99UXB01L10030", trayCode: "99UXB01L10030", section: "ROOM" },
      ],
    });
    // "---" is an empty cell; a cable may have no trays at all.
    expect(local).toMatchObject({ origin: { room: null }, route: [] });
  });

  it("builds the trays with their drawing sheets, titles and most common size", async () => {
    const { trays, issues, stats } = await extractProjectData([
      { name: "planos.pdf", data: drawings.slice() },
      { name: "electrico.pdf", data: cableList.slice() },
    ]);
    const byCode = new Map(trays.map((tray) => [tray.code, tray]));

    expect(byCode.get("99UXA00L22036")).toEqual({
      code: "99UXA00L22036",
      kind: "LADDER",
      voltageLevel: 2,
      elevationLevel: 2,
      areaCode: "99UXA",
      widthMm: 600,
      flangeHeightMm: 100,
      bendRadiusMm: 300,
      diameterMm: null,
      drawings: [
        {
          drawing: "EJ-ELE-DRW-0024",
          sheet: "02",
          title: "MAIN ELECTRICAL BUILDING - FIRST FLOOR",
          sourcePage: 2,
        },
      ],
    });
    // In a route but in no drawing: created without a sheet, and reported.
    expect(byCode.get("99UXA00L22051")?.drawings).toEqual([]);
    expect(stats).toMatchObject({ traysInDrawings: 2, traysOnlyInRoutes: 1 });
    expect(issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Tamaños distintos en los planos (L600100300, L400100300): se usa L600100300.",
        "1 bandejas de los recorridos no aparecen en ningún plano: se crean sin plano.",
      ]),
    );
  });

  it("writes a readable report", async () => {
    const result = await extractProjectData(
      [{ name: "electrico.pdf", data: cableList.slice() }],
      () => {},
    );
    const report = formatReport(result, new Date("2026-11-13T10:00:00Z"));

    expect(report).toContain("Generado: 2026-11-13T10:00:00.000Z");
    expect(report).toContain("| electrico.pdf | 6 | 5 | 0 |");
    expect(report).toContain("- Cables: 2 (L2: 2).");
    expect(report).toContain("## Errores");
    expect(report).toContain('| electrico.pdf | 6 | 99XAT10W2009 | Nivel ilegible: "L9". |');
  });
});
