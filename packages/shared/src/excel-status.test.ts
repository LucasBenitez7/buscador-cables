import { describe, expect, it } from "vitest";
import {
  cableLengthItems,
  detectExcelKind,
  excelDateFromFileName,
  excelStatusRowSchema,
  findExcelSheet,
  formatExcelDay,
  normalizeHeader,
  findPlannedReelSheet,
  readExcelLengths,
  readExcelPlannedReels,
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
  "Connections Origin (ud)",
  "Connections Destination (ud)",
  "Conectores Instalados Origen",
  "Conectores Instalados Destino",
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
    expect(excelDateFromFileName("estado 123.11.26.xlsx")).toBeNull();
  });

  it("reads a very long name in one pass", () => {
    const started = performance.now();
    expect(excelDateFromFileName(`${"1_".repeat(50_000)}a 16.11.26.xlsx`)).toBe("2026-11-16");
    expect(excelDateFromFileName("1".repeat(100_000))).toBeNull();
    expect(performance.now() - started).toBeLessThan(1000);
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
      // The electrical sheet has no planned reel: it comes from the total table.
      plannedReel: null,
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

  it("takes the planned reel of each cable from the total table, laid or not", () => {
    const result = readExcelStatus(
      "ELECTRICAL",
      [
        ELECTRICAL_HEADER,
        electrical({ code: "ZZ-1", status: "Tendido", reel: "XX-Y1-100", usedReel: "B-101" }),
        electrical({ code: "ZZ-2", status: "No Tendido", reelStatus: "En Sitio" }),
        electrical({ code: "ZZ-3", status: "No Tendido" }),
      ],
      {
        plannedReels: new Map([
          ["ZZ-1", "B-100"],
          ["ZZ-2", "B-102"],
        ]),
      },
    );

    expect(
      result.ok && result.rows.map((row) => [row.code, row.plannedReel, row.reel, row.reelStatus]),
    ).toEqual([
      ["ZZ-1", "B-100", "B-101", null],
      ["ZZ-2", "B-102", null, "En Sitio"],
      ["ZZ-3", null, null, null],
    ]);
  });

  it("never takes «Bobina» as the reel actually used", () => {
    const header = ELECTRICAL_HEADER.filter((name) => name !== "Bobina usada ");

    expect(readExcelStatus("ELECTRICAL", [header])).toEqual({
      ok: false,
      kind: "ELECTRICAL",
      missingColumns: ["Bobina usada"],
    });
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
    extra[4] ?? null,
    extra[5] ?? null,
    extra[6] ?? null,
    extra[7] ?? null,
  ];

  it("connects each end when all its planned connectors are fitted", () => {
    const connectors = (planned: [number | null, number | null], fitted: ExcelCell[]) => [
      null,
      null,
      null,
      null,
      planned[0],
      planned[1],
      ...fitted,
    ];
    const result = readExcelStatus("INSTRUMENTATION", [
      INSTRUMENTATION_HEADER,
      row("90XX10W1", "Tendido", connectors([2, 2], [2, 2])),
      row("90XX10W2", "Tendido", connectors([17, 17], [17, 0])),
      row("90XX10W3", "Tendido", connectors([1, 1], [null, 1])),
      row("90XX10W4", "Tendido", connectors([4, 4], [4, 3])),
      row("90XX10W5", "Tendido", connectors([null, null], [1, "2"])),
      row("90XX10W6", "No Tendido", connectors([1, 1], [1, 1])),
    ]);
    expect(result.ok && result.rows.map((item) => [item.code, item.connectionStatus])).toEqual([
      ["90XX10W1", "CONNECTED"],
      ["90XX10W2", "ORIGIN_ONLY"],
      ["90XX10W3", "DESTINATION_ONLY"],
      ["90XX10W4", "ORIGIN_ONLY"],
      ["90XX10W5", "CONNECTED"],
      // A cable that is not laid cannot be connected.
      ["90XX10W6", "DISCONNECTED"],
    ]);
  });

  it("reads the planned reel of «Bobina» apart from the one used", () => {
    const result = readExcelStatus("INSTRUMENTATION", [
      INSTRUMENTATION_HEADER,
      row("90XX10W1", "Tendido", ["B-201"]),
      row("90XX10W2", "No Tendido", [null, null, "En Sitio"]),
    ]);

    expect(
      result.ok &&
        result.rows.map((item) => [item.code, item.plannedReel, item.reel, item.reelStatus]),
    ).toEqual([
      ["90XX10W1", "B-200", "B-201", null],
      ["90XX10W2", "B-200", null, "En Sitio"],
    ]);
  });

  it("needs the columns of the connectors", () => {
    expect(readExcelStatus("INSTRUMENTATION", [INSTRUMENTATION_HEADER.slice(0, -1)])).toEqual({
      ok: false,
      kind: "INSTRUMENTATION",
      missingColumns: ["Conectores Instalados Destino"],
    });
  });

  it("lays without connectors, and has no metres without pullings", () => {
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
        connectionStatus: "DISCONNECTED",
        laidOn: "2026-10-01",
        company: "Montajes Sur",
        reel: "301",
        plannedReel: "B-200",
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
    plannedReel: null,
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
      value: "52 m por cable · 936 m en todo el circuito (18 cables)",
    });
  });

  it("writes the dates with their day and joins the reel with its state", () => {
    expect(formatExcelDay("2026-07-11")).toBe("11/07/2026");
    expect(reelText("B-101", "En obra")).toBe("B-101 · En obra");
    expect(reelText(null, "En obra")).toBe("En obra");
    expect(reelText(null, null)).toBeNull();
  });
});

describe("readExcelLengths", () => {
  // The sheet of the pullings: other tables follow with the same headers, to be skipped.
  const header = [
    "",
    "DATE",
    "CABLE TAG",
    "START [m]",
    "END [m]",
    "PULLED [m]",
    "DATE",
    "PULLED [m]",
  ];
  const pulling = (code: ExcelCell, date: ExcelCell, start: number, end: number) => [
    null,
    date,
    code,
    start,
    end,
    start - end,
    null,
    9,
  ];
  const read = (...rows: ExcelCell[][]) => {
    const result = readExcelLengths("INSTRUMENTATION", [header, ...rows]);
    if (!result.ok) throw new Error("columns");
    return result.lengths;
  };

  it("takes the metres of each cable from the first table of the sheet", () => {
    const lengths = read(
      pulling("90XX10W1", new Date(Date.UTC(2026, 9, 1)), 500, 395),
      pulling("90XX10W2", null, 300, 280),
      [null, null, "90XX10W3", null, null, null],
      [null, null, null, 10, 5, 5],
    );

    expect([...lengths.metres]).toEqual([
      ["90XX10W1", 105],
      ["90XX10W2", 20],
    ]);
    expect(lengths.ignored).toEqual([]);
  });

  it("counts once a pulling written down twice exactly the same", () => {
    const lengths = read(pulling("90XX10W1", null, 500, 395), pulling("90XX10W1", null, 500, 395));

    expect(lengths.metres.get("90XX10W1")).toBe(105);
    expect(lengths.ignored).toEqual([]);
  });

  it("uses the newest pulling of a cable written down twice and says which one it left", () => {
    const lengths = read(
      pulling("90XX10W1", new Date(Date.UTC(2026, 10, 14)), 200, 119),
      pulling("90XX10W1", new Date(Date.UTC(2026, 9, 20)), 500, 475),
      pulling("90XX10W2", null, 300, 280),
      pulling("90XX10W2", null, 700, 650),
    );

    expect(lengths.metres.get("90XX10W1")).toBe(81);
    // Without dates, the lower row is the last one written down.
    expect(lengths.metres.get("90XX10W2")).toBe(50);
    expect(lengths.ignored).toEqual([
      {
        row: 3,
        code: "90XX10W1",
        reason: "Tendido repetido en la hoja «Table»: se usa la fila 2",
      },
      {
        row: 4,
        code: "90XX10W2",
        reason: "Tendido repetido en la hoja «Table»: se usa la fila 5",
      },
    ]);
  });

  it("says which columns are missing", () => {
    expect(readExcelLengths("INSTRUMENTATION", [["CABLE TAG", "Fecha"]])).toEqual({
      ok: false,
      missingColumns: ["PULLED [m]"],
    });
  });

  it("gives the metres to the laid cables of the instrumentation sheet", () => {
    const lengths = read(pulling("90XX10W1", null, 500, 395), pulling("90XX10W2", null, 300, 280));
    const result = readExcelStatus(
      "INSTRUMENTATION",
      [
        INSTRUMENTATION_HEADER,
        [1, "90XX10W1", null, null, null, "Tendido", null, null, null],
        [2, "90XX10W2", null, null, null, "No Tendido", null, null, null],
      ],
      { lengths: { metres: lengths.metres, ignored: [{ row: 9, code: "90XX10W9", reason: "x" }] } },
    );

    expect(result.ok && result.rows).toEqual([
      expect.objectContaining({
        code: "90XX10W1",
        actualLengthM: 105,
        actualLengthTotalM: 105,
        sections: null,
      }),
      expect.objectContaining({ code: "90XX10W2", actualLengthM: null, actualLengthTotalM: null }),
    ]);
    expect(result.ok && result.ignored).toEqual([{ row: 9, code: "90XX10W9", reason: "x" }]);
  });
});

describe("findPlannedReelSheet", () => {
  it("finds the total table by its shape, not by the word in the middle", () => {
    expect(
      findPlannedReelSheet("ELECTRICAL", [
        "Resumen",
        "Table EMPRESA TOTAL (Format Orig)",
        "MASTER CABLE",
        "table  empresa total ",
      ]),
    ).toBe("table  empresa total ");
    expect(findPlannedReelSheet("ELECTRICAL", ["Tabla Otra Total"])).toBe("Tabla Otra Total");
    expect(findPlannedReelSheet("ELECTRICAL", ["Table", "TABLE ", "Tabla total"])).toBeNull();
    expect(findPlannedReelSheet("INSTRUMENTATION", ["Table EMPRESA TOTAL"])).toBeNull();
  });
});

describe("readExcelPlannedReels", () => {
  const header = ["Rev. Cable List", "Cable Code", "Drum estimated", "Drum used"];

  it("keeps the first planned reel of each cable and skips rows without one", () => {
    const result = readExcelPlannedReels("ELECTRICAL", [
      header,
      [1, "zz 1", " B-100 ", "B-101"],
      [1, "ZZ-2", null, "B-102"],
      [1, "ZZ-1", "B-900", null],
      [1, "ZZ#3", "B-103", null],
      [1, "ZZ-4", "#N/A", null],
    ]);

    expect(result.ok && [...result.plannedReels]).toEqual([["ZZ-1", "B-100"]]);
  });

  it("says which columns are missing", () => {
    expect(readExcelPlannedReels("ELECTRICAL", [["Cable Code", "Drum used"]])).toEqual({
      ok: false,
      missingColumns: ["Drum estimated"],
    });
  });

  it("has no total table to read in the instrumentation file", () => {
    expect(readExcelPlannedReels("INSTRUMENTATION", [header])).toEqual({
      ok: false,
      missingColumns: [],
    });
  });
});
