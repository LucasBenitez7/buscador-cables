import { describe, expect, it } from "vitest";
import { readPdfPages, type PdfPage } from "../pdf/read-pdf";
import { coverPage, drawingSheet, instrumentSheet, powerSheet } from "../testing/fixtures";
import { makePdf, type PdfPageSpec } from "../testing/make-pdf";
import { cableSheetLayout, parseCableSheet } from "./cable-page";
import { normalizeSheet, parseDrawingSheet } from "./drawing-page";

async function pageOf(spec: PdfPageSpec): Promise<PdfPage> {
  for await (const page of readPdfPages(makePdf([spec]))) return page;
  throw new Error("Sin páginas");
}

describe("parseCableSheet: power sheet", () => {
  it("reads every field of an L2-L4 sheet", async () => {
    const page = await pageOf(
      powerSheet({
        code: "99XAT10W2005",
        altCode: "99 CBLC-0001",
        revision: "3_RX00",
        service: ["STAR POINT COMMANDS AND STATUS FROM 99XAT10GS600 TO", "99XAY10"],
        level: "L2",
        length: "85 m (PEND.)",
        typeCode: "Q0825",
        typeText: "0,6/1 KV 8X2.5 MM2 CU",
        circuit: "1 de 2",
        perCircuit: "3",
        composition: "3PH+N+PE",
        from: {
          equipment: "99XAT10GS600",
          cubicle: "GCB",
          functionKks: "=99XBA00GS101",
          installationKks: "+99XBA01",
        },
        to: { equipment: "99XAY10" },
        route: ["99UXA00L22036", "99UXA00L22051", "CONTIGUOUS PANEL", "99UZA00L22001"],
        observations: "Shields connected to earthing on both sides",
      }),
    );

    expect(cableSheetLayout(page)).toBe("power");
    expect(parseCableSheet(page)).toEqual({
      layout: "power",
      page: 1,
      document: "EJ-ELE-LST-0011",
      code: "99XAT10W2005",
      footerCode: "99XAT10W2005",
      altCode: "99 CBLC-0001",
      revision: "3_RX00",
      level: "L2",
      length: "85 m (PEND.)",
      typeCode: "Q0825",
      typeText: "0,6/1 KV 8X2.5 MM2 CU",
      service: "STAR POINT COMMANDS AND STATUS FROM 99XAT10GS600 TO 99XAY10",
      circuit: "1 de 2",
      cablesPerCircuit: "3",
      composition: "3PH+N+PE",
      diagram: null,
      loop: null,
      from: {
        equipment: "99XAT10GS600",
        cubicle: "GCB",
        gland: null,
        functionKks: "=99XBA00GS101",
        installationKks: "+99XBA01",
        location: null,
        extra: null,
      },
      to: {
        equipment: "99XAY10",
        cubicle: null,
        gland: null,
        functionKks: null,
        installationKks: null,
        location: null,
        extra: null,
      },
      route: ["99UXA00L22036", "99UXA00L22051", "CONTIGUOUS PANEL", "99UZA00L22001"],
      observations: "Shields connected to earthing on both sides",
    });
  });

  it("does not take a long cable type as the number of circuits", async () => {
    const page = await pageOf(
      powerSheet({
        code: "99XAT10W2006",
        typeText: "0,6/1KV 3X10MM2CU Function integrity E90 acc to DIN 4102",
      }),
    );

    expect(parseCableSheet(page)?.circuit).toBe("1");
  });
});

describe("parseCableSheet: instrumentation sheet", () => {
  it("reads every field of an L1 sheet, with the route sections as printed", async () => {
    const page = await pageOf(
      instrumentSheet({
        code: "99XAB10T1-W8001",
        altCode: "99 CBLM-0112",
        length: "137",
        route: ["FIELD_TRAY", "99UX_01L10002", "99UXT_2D12070", "ROOM_TRAY", "99UXB01L10030"],
        observations: "Supplied by the vendor",
      }),
    );

    expect(cableSheetLayout(page)).toBe("instrument");
    expect(parseCableSheet(page)).toMatchObject({
      layout: "instrument",
      document: "EJ-ICO-LST-0100",
      code: "99XAB10T1-W8001",
      footerCode: "99XAB10T1-W8001",
      altCode: "99 CBLM-0112",
      revision: "2",
      level: "1",
      length: "137",
      typeCode: null,
      typeText: "JE-Y(St)Y BD Si FR 4 x 2 x 0,8mm",
      diagram: "EJ-ICO-DIA-0100_010",
      from: { equipment: "99XAB10CT001", gland: "M-20ARM", location: null },
      to: { equipment: "99CXJ11", gland: "M-20", location: "99UXB23RA052" },
      route: ["FIELD_TRAY", "99UX_01L10002", "99UXT_2D12070", "ROOM_TRAY", "99UXB01L10030"],
      observations: "Supplied by the vendor",
    });
  });

  it("ignores pages that are not cable sheets", async () => {
    const page = await pageOf(coverPage());

    expect(cableSheetLayout(page)).toBeNull();
    expect(parseCableSheet(page)).toBeNull();
  });
});

describe("parseDrawingSheet", () => {
  it("reads the title block and the trays with their size", async () => {
    const page = await pageOf(
      drawingSheet({
        drawing: "EJ-ELE-DRW-0024",
        sheet: "02",
        references: ["EJ-ELE-DRW-0025"],
        trays: [
          { code: "99UXA00L40004", size: "L800100900" },
          { code: "99UXA00C20149", size: "C025" },
          { code: "99UXA00L22036" },
        ],
      }),
    );

    expect(parseDrawingSheet(page)).toEqual({
      page: 1,
      drawing: "EJ-ELE-DRW-0024",
      sheet: "02",
      index: [],
      trays: [
        { code: "99UXA00L40004", size: "L800100900" },
        { code: "99UXA00C20149", size: "C025" },
        { code: "99UXA00L22036", size: null },
      ],
    });
  });

  it("reads the sheet titles of an index page", async () => {
    const page = await pageOf(
      drawingSheet({
        drawing: "EJ-ICO-DRW-0001",
        sheet: "00",
        index: [
          ["1", "CABLE TRAY CODIFICATION DRAWING - NOTES & LEGEND"],
          ["02", "CABLE TRAY CODIFICATION DRAWING - AREA 2.1 FROM EL. -7000mm TO EL. -50mm"],
        ],
      }),
    );

    expect(parseDrawingSheet(page).index).toEqual([
      { sheet: "01", title: "NOTES & LEGEND" },
      { sheet: "02", title: "AREA 2.1 FROM EL. -7000mm TO EL. -50mm" },
    ]);
  });

  it("normalizes sheet numbers", () => {
    expect(normalizeSheet("2")).toBe("02");
    expect(normalizeSheet("SH17")).toBe("17");
    expect(normalizeSheet("Blatt")).toBeNull();
  });
});
