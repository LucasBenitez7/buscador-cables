/**
 * Invented pages with the layout of the project PDFs (positions measured on the real ones,
 * values made up: unit "99", documents "EJ-…"). See docs/DATOS-PROYECTO.md.
 */
import type { PdfPageSpec, PdfText } from "./make-pdf";

type End = Partial<{
  equipment: string;
  cubicle: string;
  gland: string;
  functionKks: string;
  installationKks: string;
  location: string;
}>;

export type PowerSheetSpec = {
  code: string;
  footer?: string;
  altCode?: string;
  revision?: string;
  service?: string[];
  level?: string;
  length?: string;
  typeCode?: string;
  typeText?: string;
  circuit?: string;
  perCircuit?: string;
  composition?: string;
  from?: End;
  to?: End;
  route?: string[];
  observations?: string;
};

/** A power cable sheet (L2-L4), A4-ish at 839 × 1184 points, 10-point text. */
export function powerSheet(spec: PowerSheetSpec): PdfPageSpec {
  const t = (text: string | undefined, x: number, top: number, size = 10): PdfText[] =>
    text ? [{ text, x, top, size }] : [];
  const service = spec.service ?? ["MOTOR FEEDER 99XAB10AP001"];
  return {
    width: 839,
    height: 1184,
    texts: [
      ...t("Code: EJ-ELE-LST-0011", 640, 32),
      ...t("Rev.: 3_RX01", 708, 45),
      ...t("CABLE ID", 74, 142.7),
      ...t(":", 123, 142.7),
      ...t(spec.code, 139.7, 142.7),
      ...t(spec.altCode, 139.7, 157),
      ...t("R.", 627, 142.5),
      ...t(spec.revision ?? "3", 643, 142.5),
      ...t("SERVICE", 74, 188),
      ...t("SERVICE LEVEL", 460, 188),
      ...t("LENGTH", 607, 188),
      ...service.flatMap((line, index) => t(line, 85, 202 + index * 10, 7.9)),
      ...t(spec.level ?? "L2", 494, 203),
      ...t(spec.length ?? "142 m", 615, 203),
      ...t("CABLE TYPE", 74, 249),
      ...t("NUM. OF CIRCT.", 460, 249),
      ...t("CAB. PER CIRCT.", 586, 249),
      ...t(spec.typeCode ?? "Q0825", 86, 262),
      ...t(spec.typeText ?? "0,6/1 KV 8X2.5 MM2 CU", 172, 262),
      ...t(spec.circuit ?? "1", 497, 263),
      ...t(spec.perCircuit ?? "1", 626, 263),
      ...t("COMPOSITION", 74, 294),
      ...t(spec.composition ?? "CONTROL", 85, 309),
      ...t("FROM", 330, 325),
      ...t("TO", 466, 325),
      ...endRows(
        [
          ["Equipment ID:", 217, 340, "equipment"],
          ["Cubicle:", 245, 355, "cubicle"],
          ["Function KKS:", 215, 370, "functionKks"],
          ["Installation KKS:", 205, 385, "installationKks"],
        ],
        spec.from ?? { equipment: "99BMA" },
        spec.to ?? { equipment: "99XAB10AP001" },
        329,
        452,
        10,
      ),
      ...t("ROUT", 74, 424),
      ...(spec.route ?? []).flatMap((step, index) => t(step, 95, 451 + index * 13.2, 9)),
      ...t("Observations :", 154, 1000),
      ...t(spec.observations, 260, 1000),
      ...t("ORIGIN CONNECTION", 160, 1040),
      ...t(spec.footer ?? spec.code, 72, 1110, 7),
    ],
  };
}

export type InstrumentSheetSpec = {
  code: string;
  footer?: string;
  altCode?: string;
  revision?: string;
  level?: string;
  length?: string;
  typeText?: string;
  diagram?: string;
  from?: End;
  to?: End;
  route?: string[];
  observations?: string;
};

/** An instrumentation cable sheet (L1), 595 × 842 points, 5.8-point text. */
export function instrumentSheet(spec: InstrumentSheetSpec): PdfPageSpec {
  const size = 5.8;
  const t = (text: string | undefined, x: number, top: number): PdfText[] =>
    text ? [{ text, x, top, size }] : [];
  return {
    width: 595,
    height: 842,
    texts: [
      ...t("Code: EJ-ICO-LST-0100", 504.5, 22.6),
      ...t("CABLE ID", 19.8, 69.6),
      ...t(":", 48, 69.6),
      ...t(spec.code, 90.9, 69.5),
      ...t(spec.altCode, 90.9, 76.5),
      ...t("LOOP", 383.2, 76.3),
      ...t("REV.", 513.3, 76.3),
      ...t(spec.revision ?? "2", 530.4, 76.5),
      ...t("LEVEL", 382.6, 91),
      ...t(spec.level ?? "1", 410.5, 91),
      ...t("LENGTH (m)", 477.1, 91),
      ...t(spec.length ?? "137", 530.4, 91),
      ...t("CABLE TYPE", 19.8, 104.4),
      ...t(spec.typeText ?? "JE-Y(St)Y BD Si FR 4 x 2 x 0,8mm", 32.8, 112.2),
      ...t("DIAGRAM", 19.8, 125.9),
      ...t(spec.diagram ?? "EJ-ICO-DIA-0100_010", 32.8, 133.6),
      ...t("FROM", 273.6, 141.3),
      ...t("TO", 408.1, 141.3),
      ...endRows(
        [
          ["Equipment ID:", 170.4, 148.9, "equipment"],
          ["Gland:", 191.1, 156.6, "gland"],
          ["Location:", 183.4, 164.3, "location"],
        ],
        spec.from ?? { equipment: "99XAB10CT001", gland: "M-20ARM" },
        spec.to ?? { equipment: "99CXJ11", gland: "M-20", location: "99UXB23RA052" },
        260.9,
        400.5,
        size,
      ),
      ...t("ROUTING", 19.8, 184.7),
      ...(spec.route ?? []).flatMap((step, index) => t(step, 24.7, 198.7 + index * 7)),
      ...t("INTERCONNECTION", 253, 184.7),
      ...t("Observations :", 60, 700),
      ...t(spec.observations, 110, 700),
      ...t(spec.footer ?? spec.code, 18, 800),
    ],
  };
}

function endRows(
  rows: [label: string, x: number, top: number, field: keyof End][],
  from: End,
  to: End,
  fromX: number,
  toX: number,
  size: number,
): PdfText[] {
  return rows.flatMap(([label, x, top, field]) => [
    { text: label, x, top, size },
    ...(from[field] ? [{ text: from[field]!, x: fromX, top, size }] : []),
    ...(to[field] ? [{ text: to[field]!, x: toX, top, size }] : []),
  ]);
}

export type DrawingSheetSpec = {
  drawing: string;
  sheet: string;
  trays?: { code: string; size?: string; x?: number; top?: number }[];
  /** Rows of the sheet index, when the page is the index. */
  index?: [sheet: string, title: string][];
  /** Other drawing numbers printed on the sheet (references to other drawings). */
  references?: string[];
};

/** A routing drawing sheet, A0 landscape, with its title block bottom right. */
export function drawingSheet(spec: DrawingSheetSpec): PdfPageSpec {
  const texts: PdfText[] = [
    { text: "Dokumenten-Nr. Lieferant:", x: 1950, top: 1557 },
    { text: spec.drawing, x: 2046, top: 1553 },
    { text: "Blatt:", x: 2242, top: 1557 },
    { text: spec.sheet, x: 2267, top: 1555 },
  ];
  (spec.references ?? []).forEach((reference, index) =>
    texts.push(
      { text: `SEE DWG:`, x: 1600, top: 300 + index * 40 },
      { text: reference, x: 1690, top: 300 + index * 40 },
    ),
  );
  (spec.trays ?? []).forEach((tray, index) => {
    const x = tray.x ?? 400;
    const top = tray.top ?? 400 + index * 20;
    texts.push({ text: tray.code, x, top });
    if (tray.size) texts.push({ text: tray.size, x: x + 100, top });
  });
  if (spec.index) {
    texts.push({ text: "SHEET INDEX", x: 229, top: 112 });
    spec.index.forEach(([sheet, title], index) => {
      texts.push({ text: sheet, x: 243, top: 169 + index * 23 });
      texts.push({ text: title, x: 272, top: 169 + index * 23 });
    });
  }
  return { width: 2384, height: 1684, texts };
}

/** A page that is neither a cable sheet nor a drawing: a cover or a change list. */
export function coverPage(): PdfPageSpec {
  return {
    width: 595,
    height: 842,
    texts: [
      { text: "CABLE ROUTING AND INTERCONNECTION LIST", x: 60, top: 60, size: 12 },
      { text: "Revision 02", x: 60, top: 90 },
    ],
  };
}
