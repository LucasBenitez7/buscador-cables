import { describe, expect, it } from "vitest";
import {
  cableLengthItems,
  detectExcelKind,
  excelDateFromFileName,
  excelStatusRowSchema,
  findExcelSheet,
  formatExcelDay,
  normalizeHeader,
  readExcelStatus,
  reelText,
  type ExcelCell,
} from "./excel-status";

// Datos inventados: ni los códigos, ni las empresas ni las bobinas son del proyecto.
const ELECTRICAL_HEADER = [
  "Cable Level",
  "Cable Code",
  "Numero de secciones ",
  "Bobina",
  "Estado Bobina",
  "Company Real ",
  "Cantidad de metros [REAL]",
  "Bobina usada ",
  "Estado cable (unificado)",
  "Fecha tendido",
];

/** One electrical row, in the order of ELECTRICAL_HEADER. */
function electrical(values: {
  code: ExcelCell;
  status: ExcelCell;
  sections?: ExcelCell;
  reel?: ExcelCell;
  reelStatus?: ExcelCell;
  company?: ExcelCell;
  metres?: ExcelCell;
  usedReel?: ExcelCell;
  laidOn?: ExcelCell;
}): ExcelCell[] {
  return [
    "L2",
    values.code,
    values.sections ?? 1,
    values.reel ?? null,
    values.reelStatus ?? null,
    values.company ?? null,
    values.metres ?? 0,
    values.usedReel ?? null,
    values.status,
    values.laidOn ?? null,
  ];
}

const INSTRUMENTATION_HEADER = [
  "ID",
  "TAG",
  "Bobina",
  "Bobina Real en campo",
  "Fecha de tendido",
  "ESTADO ",
  "Correcto/Incorrecto",
  "Estado Bobina",
  "Company Real",
];

describe("normalizeHeader", () => {
  it("ignores case, spaces and accents", () => {
    expect(normalizeHeader("  Número   de SECCIONES ")).toBe("numero de secciones");
    expect(normalizeHeader("Fecha\tde tendído")).toBe("fecha de tendido");
  });
});

describe("sheets", () => {
  it("finds the sheet of each file by its name, whatever its spelling", () => {
    expect(findExcelSheet("ELECTRICAL", ["Resumen", "master  cable", "Hitos"])).toBe(
      "master  cable",
    );
    expect(findExcelSheet("INSTRUMENTATION", ["Sistemas", "Tabl IC Maestra"])).toBe(
      "Tabl IC Maestra",
    );
    expect(findExcelSheet("ELECTRICAL", ["Tabl IC Maestra"])).toBeNull();
  });

  it("tells which file a workbook is", () => {
    expect(detectExcelKind(["Resumen", "MASTER CABLE"])).toBe("ELECTRICAL");
    expect(detectExcelKind(["Tabl IC Maestra"])).toBe("INSTRUMENTATION");
    expect(detectExcelKind(["Hoja1"])).toBeNull();
  });
});

describe("excelDateFromFileName", () => {
  it("reads the last date of the name, with dots, dashes or underscores", () => {
    expect(excelDateFromFileName("Listado ELE rev10_16.11.26.xlsx")).toBe("2026-11-16");
    expect(excelDateFromFileName("Listado IC REV03_16_11_26.xlsx")).toBe("2026-11-16");
    expect(excelDateFromFileName("estado 2-3-2027.xlsx")).toBe("2027-03-02");
  });

  it("gives null without a real date", () => {
    expect(excelDateFromFileName("estado.xlsx")).toBeNull();
    expect(excelDateFromFileName("estado 31.02.26.xlsx")).toBeNull();
  });
});

describe("readExcelStatus: columns", () => {
  it("finds the columns by name wherever they are", () => {
    const shuffled = [...ELECTRICAL_HEADER].reverse();
    const row = electrical({ code: "zz-1", status: "Tendido", metres: 40 }).reverse();

    const result = readExcelStatus("ELECTRICAL", [shuffled, row]);

    expect(result.ok && result.rows[0]).toMatchObject({ code: "ZZ-1", actualLengthM: 40 });
  });

  it("accepts alternative names", () => {
    const header = ELECTRICAL_HEADER.map((name) =>
      name === "Company Real " ? "Empresa" : name === "Fecha tendido" ? "Fecha de tendido" : name,
    );

    expect(readExcelStatus("ELECTRICAL", [header]).ok).toBe(true);
  });

  it("says which columns are missing and reads nothing", () => {
    const header = ELECTRICAL_HEADER.filter(
      (name) => name !== "Fecha tendido" && name !== "Numero de secciones ",
    );

    expect(
      readExcelStatus("ELECTRICAL", [header, electrical({ code: "ZZ-1", status: "Tendido" })]),
    ).toEqual({
      ok: false,
      kind: "ELECTRICAL",
      missingColumns: ["Fecha tendido", "Numero de secciones"],
    });
  });

  it("does not need the connection or the metres in the instrumentation file", () => {
    expect(readExcelStatus("INSTRUMENTATION", [INSTRUMENTATION_HEADER]).ok).toBe(true);
  });
});

describe("readExcelStatus: electrical", () => {
  const read = (...rows: ExcelCell[][]) => {
    const result = readExcelStatus("ELECTRICAL", [ELECTRICAL_HEADER, ...rows]);
    if (!result.ok) throw new Error(result.missingColumns.join(", "));
    return result;
  };

  it("translates every status of the file", () => {
    const { rows } = read(
      electrical({ code: "ZZ-1", status: "No Tendido" }),
      electrical({ code: "ZZ-2", status: "Tendido" }),
      electrical({ code: "ZZ-3", status: "Conectado Origen" }),
      electrical({ code: "ZZ-4", status: "conectado  destino" }),
      electrical({ code: "ZZ-5", status: "Conectado" }),
    );

    expect(rows.map((row) => [row.code, row.installationStatus, row.connectionStatus])).toEqual([
      ["ZZ-1", "NOT_LAID", "DISCONNECTED"],
      ["ZZ-2", "LAID", "DISCONNECTED"],
      ["ZZ-3", "LAID", "ORIGIN_ONLY"],
      ["ZZ-4", "LAID", "DESTINATION_ONLY"],
      ["ZZ-5", "LAID", "CONNECTED"],
    ]);
  });

  it("reads the date, the company, the reel and the real metres per section", () => {
    const { rows } = read(
      electrical({
        code: "zz 10",
        status: "Conectado",
        laidOn: new Date(Date.UTC(2026, 6, 11)),
        company: " Montajes  Norte ",
        reel: "B-100",
        usedReel: "B-101",
        reelStatus: "En obra",
        metres: 936,
        sections: 18,
      }),
    );

    expect(rows[0]).toEqual({
      row: 2,
      code: "ZZ-10",
      installationStatus: "LAID",
      connectionStatus: "CONNECTED",
      laidOn: "2026-07-11",
      company: "Montajes Norte",
      reel: "B-101",
      reelStatus: "En obra",
      actualLengthTotalM: 936,
      sections: 18,
      actualLengthM: 52,
    });
    expect(excelStatusRowSchema.parse(rows[0])).toEqual(rows[0]);
  });

  it("rounds the metres per section to two decimals", () => {
    const { rows } = read(
      electrical({ code: "ZZ-1", status: "Tendido", metres: 100, sections: 3 }),
    );

    expect(rows[0]).toMatchObject({ actualLengthTotalM: 100, actualLengthM: 33.33 });
  });

  it("has no date nor metres for a cable that is not laid", () => {
    const { rows } = read(
      electrical({
        code: "ZZ-1",
        status: "No Tendido",
        laidOn: new Date(Date.UTC(2026, 6, 11)),
        metres: 0,
        reel: "B-100",
      }),
    );

    expect(rows[0]).toMatchObject({
      laidOn: null,
      actualLengthTotalM: null,
      actualLengthM: null,
      reel: null,
    });
  });

  it("reads dates as Excel serial numbers and as text", () => {
    const { rows } = read(
      electrical({ code: "ZZ-1", status: "Tendido", laidOn: 46214 }),
      electrical({ code: "ZZ-2", status: "Tendido", laidOn: "11/7/2026" }),
      electrical({ code: "ZZ-3", status: "Tendido", laidOn: "31/2/2026" }),
    );

    expect(rows.map((row) => row.laidOn)).toEqual(["2026-07-11", "2026-07-11", null]);
  });

  it("treats Excel errors and empty cells as no data", () => {
    const { rows } = read(
      electrical({ code: "ZZ-1", status: "Tendido", reelStatus: "#NAME?", company: "  " }),
    );

    expect(rows[0]).toMatchObject({ reelStatus: null, company: null });
  });

  it("ignores «Check», unknown statuses, empty statuses, bad codes and repeated codes", () => {
    const result = read(
      electrical({ code: "ZZ-1", status: "Check" }),
      electrical({ code: "ZZ-2", status: null }),
      electrical({ code: "ZZ#3", status: "Tendido" }),
      electrical({ code: "ZZ-4", status: "Tendido" }),
      electrical({ code: "zz-4", status: "Conectado" }),
      electrical({ code: "ZZ-5", status: "Correcto" }),
      electrical({ code: null, status: null }),
    );

    expect(result.rows.map((row) => row.code)).toEqual(["ZZ-4"]);
    expect(result.ignored).toEqual([
      { row: 2, code: "ZZ-1", reason: "Estado «Check»: no se usa" },
      { row: 3, code: "ZZ-2", reason: "Sin estado" },
      { row: 4, code: "ZZ#3", reason: "Código no válido" },
      { row: 6, code: "ZZ-4", reason: "Repetido: ya está en la fila 5" },
      { row: 7, code: "ZZ-5", reason: "Estado «Correcto»: no se usa" },
    ]);
  });
});

describe("readExcelStatus: instrumentation", () => {
  const row = (code: string, status: ExcelCell, extra: ExcelCell[] = []) => [
    1,
    code,
    "B-200",
    extra[0] ?? null,
    extra[1] ?? null,
    status,
    "Correcto",
    extra[2] ?? null,
    extra[3] ?? null,
  ];

  it("lays without saying anything about the connection, and never has real metres", () => {
    const result = readExcelStatus("INSTRUMENTATION", [
      INSTRUMENTATION_HEADER,
      row("90XX10W1", "Tendido", [301, new Date(Date.UTC(2026, 9, 1)), "En obra", "Montajes Sur"]),
      row("90XX10W2", "No Tendido"),
      row("90XX10W3", "Error"),
    ]);

    expect(result.ok && result.rows).toEqual([
      {
        row: 2,
        code: "90XX10W1",
        installationStatus: "LAID",
        connectionStatus: null,
        laidOn: "2026-10-01",
        company: "Montajes Sur",
        reel: "301",
        reelStatus: "En obra",
        actualLengthTotalM: null,
        sections: null,
        actualLengthM: null,
      },
      expect.objectContaining({
        code: "90XX10W2",
        installationStatus: "NOT_LAID",
        connectionStatus: "DISCONNECTED",
      }),
    ]);
    expect(result.ok && result.ignored).toEqual([
      { row: 4, code: "90XX10W3", reason: "Estado «Error»: no se usa" },
    ]);
  });
});

describe("excelStatusRowSchema", () => {
  const valid = {
    row: 2,
    code: "ZZ-1",
    installationStatus: "LAID",
    connectionStatus: null,
    laidOn: "2026-07-11",
    company: null,
    reel: null,
    reelStatus: null,
    actualLengthTotalM: null,
    sections: null,
    actualLengthM: null,
  };

  it("validates again on the server what the browser sends", () => {
    expect(excelStatusRowSchema.safeParse(valid).success).toBe(true);
    expect(excelStatusRowSchema.parse({ ...valid, code: "zz 1" }).code).toBe("ZZ-1");
    for (const wrong of [
      { installationStatus: "COILED" },
      { laidOn: "11/07/2026" },
      { company: "x".repeat(101) },
      { actualLengthM: -3 },
      { row: 1 },
    ]) {
      expect(excelStatusRowSchema.safeParse({ ...valid, ...wrong }).success).toBe(false);
    }
  });
});

describe("cable record texts", () => {
  const base = {
    lengthM: 50,
    lengthPending: false,
    actualLengthM: null,
    actualLengthTotalM: null,
    actualSections: null,
  };

  it("shows only «Longitud» without real metres", () => {
    expect(cableLengthItems(base)).toEqual([{ label: "Longitud", value: "50 m" }]);
    expect(cableLengthItems({ ...base, lengthM: null, lengthPending: true })).toEqual([
      { label: "Longitud", value: "Sin longitud (pendiente)" },
    ]);
  });

  it("shows the planned and the real length when the Excel brings it", () => {
    expect(cableLengthItems({ ...base, actualLengthM: 52.5, actualSections: 1 })).toEqual([
      { label: "Longitud prevista", value: "50 m" },
      { label: "Longitud real", value: "52,5 m" },
    ]);
  });

  it("explains the metres of a circuit of several sections", () => {
    expect(
      cableLengthItems({ ...base, actualLengthM: 52, actualLengthTotalM: 936, actualSections: 18 }),
    ).toContainEqual({
      label: "Longitud real",
      value: "52 m por tramo · 936 m en total, 18 tramos",
    });
  });

  it("writes the dates with their day and joins the reel with its state", () => {
    expect(formatExcelDay("2026-07-11")).toBe("11/07/2026");
    expect(reelText("B-101", "En obra")).toBe("B-101 · En obra");
    expect(reelText(null, "En obra")).toBe("En obra");
    expect(reelText(null, null)).toBeNull();
  });
});
