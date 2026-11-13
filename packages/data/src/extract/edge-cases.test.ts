/** Unusual pages: missing blocks, odd layouts and rows that do not validate. */
import { describe, expect, it } from "vitest";
import { parseCableSheet } from "../parse/cable-page";
import { parseDrawingSheet } from "../parse/drawing-page";
import { readPdfPages, type PdfPage } from "../pdf/read-pdf";
import { drawingSheet, instrumentSheet, powerSheet } from "../testing/fixtures";
import { makePdf, type PdfPageSpec } from "../testing/make-pdf";
import { extractProjectData } from "./extract";
import { normalizeCableSheet } from "./normalize";
import { formatReport } from "./report";
import type { ExtractionResult } from "./schema";

async function pageOf(spec: PdfPageSpec): Promise<PdfPage> {
  for await (const page of readPdfPages(makePdf([spec]))) return page;
  throw new Error("Sin páginas");
}

const without = (spec: PdfPageSpec, ...texts: string[]): PdfPageSpec => ({
  ...spec,
  texts: spec.texts.filter((text) => !texts.includes(text.text)),
});

describe("cable sheets with missing blocks", () => {
  it("is not a cable sheet when it only has a CABLE ID label", async () => {
    const page = await pageOf({
      width: 595,
      height: 842,
      texts: [{ text: "CABLE ID", x: 20, top: 70 }],
    });

    expect(parseCableSheet(page)).toBeNull();
  });

  it("leaves both ends empty without the FROM or the TO header", async () => {
    const sheet = powerSheet({ code: "99XAT10W2005" });
    for (const missing of ["FROM", "TO"]) {
      const raw = parseCableSheet(await pageOf(without(sheet, missing)));
      expect(raw?.from.equipment).toBeNull();
      expect(raw?.to.equipment).toBeNull();
    }
  });

  it("reads no type without the CABLE TYPE and COMPOSITION labels", async () => {
    const raw = parseCableSheet(
      await pageOf(without(powerSheet({ code: "99XAT10W2005" }), "COMPOSITION")),
    );

    expect(raw).toMatchObject({ typeCode: null, typeText: null, composition: null });
    expect(normalizeCableSheet(raw!, "electrico.pdf")).toMatchObject({
      cable: null,
      issues: [{ severity: "error", message: "Ficha sin tipo de cable." }],
    });
  });

  it("drops a sheet without a code", async () => {
    const raw = parseCableSheet(await pageOf(instrumentSheet({ code: "99XAB10T1-W8001" })))!;

    expect(normalizeCableSheet({ ...raw, code: "  " }, "instrumentacion.pdf")).toEqual({
      cable: null,
      code: null,
      issues: [{ severity: "error", message: "Ficha sin código de cable." }],
    });
  });

  it("reports a row that does not pass the schema and leaves it out", async () => {
    const data = makePdf([instrumentSheet({ code: "99XAB10T1+W8001" })]);

    const { cables, issues } = await extractProjectData([{ name: "lista.pdf", data }]);

    expect(cables).toEqual([]);
    expect(issues).toEqual([
      {
        severity: "error",
        file: "lista.pdf",
        page: 1,
        code: "99XAB10T1+W8001",
        message: "code: Código de cable no válido",
      },
    ]);
  });
});

describe("drawing sheets with other layouts", () => {
  it("reads the sheet number in its own run and the size in the tray's run", async () => {
    const spec = drawingSheet({ drawing: "EJ-ELE-DRW-0021", sheet: "03" });
    const page = await pageOf({
      ...spec,
      texts: [
        ...spec.texts.map((text) => (text.text === "03" ? { ...text, x: 2320 } : text)),
        { text: "99UXA00L40004 L800100900", x: 400, top: 400 },
      ],
    });

    expect(parseDrawingSheet(page)).toMatchObject({
      sheet: "03",
      trays: [{ code: "99UXA00L40004", size: "L800100900" }],
    });
  });

  it("skips index rows without a title and pages without a title block", async () => {
    const indexPage = await pageOf(
      drawingSheet({ drawing: "EJ-ELE-DRW-0021", sheet: "00", index: [["01", "SHORT"]] }),
    );
    expect(parseDrawingSheet(indexPage).index).toEqual([]);

    const blank = await pageOf({ width: 600, height: 400, texts: [{ text: "x", x: 1, top: 1 }] });
    expect(parseDrawingSheet(blank)).toMatchObject({ drawing: null, sheet: null });
  });
});

describe("formatReport", () => {
  it("lists at most 200 issues per group and points to report.json for the rest", () => {
    const result: ExtractionResult = {
      cables: [],
      trays: [],
      issues: Array.from({ length: 205 }, (_, index) => ({
        severity: "warning" as const,
        file: "lista.pdf",
        page: index + 1,
        code: null,
        message: `Aviso | ${index}`,
      })),
      stats: { files: [], cablesByLevel: {}, traysInDrawings: 0, traysOnlyInRoutes: 0 },
    };

    const report = formatReport(result);

    expect(report).toContain("Aviso \\| 0");
    expect(report).not.toContain("Aviso \\| 200");
    expect(report).toContain("… y 5 más (ver `report.json`).");
    expect(report).not.toContain("## Errores");
  });
});
