import { describe, expect, it } from "vitest";
import {
  excelReelSchema,
  readExcelReelPulls,
  readExcelReels,
  reelId,
  reelIds,
  reelKey,
  type ExcelReel,
} from "./excel-reels";
import type { ExcelCell } from "./excel-status";

// Datos inventados: ni las bobinas, ni los drums ni las descripciones son del proyecto.
const TRACKING_HEADER = [
  "Nro Solicitud ",
  "Nro Solicitud Interna",
  "Drum Identification",
  "Descripcion Cable ",
  " Warehouse TAG\nNUMBER",
  "Tipo voltaje ",
  "Fecha/Recogida ",
  "Metros Recibidos ",
  "Tiradas reales ",
  "Tiradas pendientes ",
  "Mts estimados ",
  "Metros Usados",
  "Metros Restantes ",
  "Otros consumos ",
];

function tracking(values: {
  request?: ExcelCell;
  drum: ExcelCell;
  tag: ExcelCell;
  description?: ExcelCell;
  voltage?: ExcelCell;
  pickedUp?: ExcelCell;
  received?: ExcelCell;
  pulls?: ExcelCell;
  pending?: ExcelCell;
  pendingM?: ExcelCell;
  used?: ExcelCell;
  remaining?: ExcelCell;
  other?: ExcelCell;
}): ExcelCell[] {
  return [
    values.request ?? "EJ-DRUM 01",
    1,
    values.drum,
    values.description ?? "EJ 1x95 cable",
    values.tag,
    values.voltage ?? 0,
    values.pickedUp ?? null,
    values.received ?? 500,
    values.pulls ?? 0,
    values.pending ?? 0,
    values.pendingM ?? 0,
    values.used ?? 0,
    values.remaining ?? 500,
    values.other ?? null,
  ];
}

const STOCK_HEADER = [
  "Package Nº",
  "Description",
  "Drum codification (EJ)",
  "Our TAG nº (MRR)",
  "Drum nº (for voucher)",
  "Meters",
  "Type Voltaje",
];

const IC_STOCK_HEADER = [
  "SUPPLIER",
  "EJ TAG\nNUMBER",
  "Drum Identification",
  "UM",
  "QUANTITY RECEIVER",
  "Description of Gods",
];

const EMPTY: Omit<ExcelReel, "drum" | "tag" | "tracked" | "pieces"> = {
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
};

describe("reelId", () => {
  it("compares names in capitals with single spaces", () => {
    expect(reelId(" ej99001a ")).toBe("EJ99001A");
    expect(reelId("EJ  DRUM 7")).toBe("EJ DRUM 7");
  });

  it("is not a reel without a figure, or a lone zero", () => {
    for (const value of ["0", ".", "NA", "PEND", "ELIMINADO", "NO DEFINE", "", "  ", null]) {
      expect(reelId(value)).toBeNull();
    }
  });

  it("splits the reels a cable names", () => {
    expect(reelIds("155 / 154")).toEqual(["155", "154"]);
    expect(reelIds("EJ1, EJ2;EJ1")).toEqual(["EJ1", "EJ2"]);
    expect(reelIds("0 / PEND")).toEqual([]);
    expect(reelIds(null)).toEqual([]);
  });
});

describe("reelKey", () => {
  it("is the tag in the electrical file and the drum with the tag in the other", () => {
    expect(reelKey("ELECTRICAL", { drum: "EX1", tag: "26" })).toBe("T:26");
    expect(reelKey("ELECTRICAL", { drum: "EX1", tag: null })).toBe("D:EX1");
    expect(reelKey("INSTRUMENTATION", { drum: "EJ3", tag: "3B" })).toBe("EJ3|3B");
  });
});

describe("readExcelReels", () => {
  it("reads every figure of the follow-up, by the names of its columns", () => {
    const result = readExcelReels("ELECTRICAL", {
      tracking: [
        TRACKING_HEADER,
        tracking({
          request: "EJ-DRUM 10",
          drum: "ex99001",
          tag: 26,
          pickedUp: new Date(Date.UTC(2026, 3, 14)),
          received: 504,
          pulls: 14,
          pending: 2,
          pendingM: 80.456,
          used: 407,
          remaining: 94,
          other: 3,
        }),
      ],
      stock: null,
    });

    expect(result).toEqual({
      ok: true,
      repeated: 0,
      reels: [
        {
          ...EMPTY,
          drum: "EX99001",
          tag: "26",
          tracked: true,
          pieces: null,
          request: "EJ-DRUM 10",
          description: "EJ 1x95 cable",
          pickedUpOn: "2026-04-14",
          receivedM: 504,
          pulls: 14,
          pendingPulls: 2,
          pendingM: 80.46,
          usedM: 407,
          remainingM: 94,
          otherM: 3,
        },
      ],
    });
    // «Tipo voltaje» a 0 es una fórmula vacía, no un voltaje.
    expect(result.ok && result.reels[0]!.voltage).toBeNull();
  });

  it("keeps the metres left below zero: the Excel says more was used", () => {
    const result = readExcelReels("ELECTRICAL", {
      tracking: [TRACKING_HEADER, tracking({ drum: "EX1", tag: 1, used: 542, remaining: -42 })],
      stock: null,
    });

    expect(result.ok && result.reels[0]!.remainingM).toBe(-42);
  });

  it("skips rows that are not reels and counts the repeated ones", () => {
    const result = readExcelReels("ELECTRICAL", {
      tracking: [
        TRACKING_HEADER,
        tracking({ drum: 0, tag: null }),
        tracking({ drum: "EX1", tag: 5, used: 10 }),
        tracking({ drum: "EX1", tag: 5, used: 99 }),
        [],
      ],
      stock: null,
    });

    expect(result).toMatchObject({ ok: true, repeated: 1, reels: [{ tag: "5", usedM: 10 }] });
  });

  it("adds the reels of the stock list and fills what the follow-up leaves empty", () => {
    const result = readExcelReels("ELECTRICAL", {
      tracking: [TRACKING_HEADER, tracking({ drum: "EX1", tag: 26, received: 504 })],
      stock: [
        STOCK_HEADER,
        ["EJ-LST-0001", null, null, null, null, null, null],
        [1, "EJ 1x95 cable", "LV-EJ-001", 26, "Returnable 1", 600, "LV"],
        [2, "EJ 5x16 cable", "LV-EJ-002", 157, "Returnable 2", 649, "LV"],
        [3, null, "ELIMINADO", "ELIMINADO", null, null, null],
      ],
    });

    expect(result).toEqual({
      ok: true,
      repeated: 0,
      reels: [
        expect.objectContaining({
          tag: "26",
          drum: "EX1",
          tracked: true,
          pieces: 1,
          code: "LV-EJ-001",
          voltage: "LV",
          // El seguimiento manda: sus metros recibidos, no los de la lista.
          receivedM: 504,
        }),
        {
          ...EMPTY,
          drum: null,
          tag: "157",
          tracked: false,
          pieces: 1,
          code: "LV-EJ-002",
          description: "EJ 5x16 cable",
          voltage: "LV",
          receivedM: 649,
        },
      ],
    });
  });

  it("tells apart two pieces of one drum and counts reels that share a name", () => {
    const result = readExcelReels("INSTRUMENTATION", {
      tracking: [
        TRACKING_HEADER.map((name) => (name.includes("TAG") ? "EJ TAG\nNUMBER" : name)),
        tracking({ drum: "EJ0003", tag: 3, used: 100 }),
        tracking({ drum: "EJ0003", tag: "3B", used: 200 }),
        tracking({ drum: "EJLOT7", tag: "EJLOT7", received: 2100, used: 6470, remaining: -4370 }),
      ],
      stock: [
        IC_STOCK_HEADER,
        ["EJ S.A.", 3, "EJ0003", "Mt", 1000, "EJ pair"],
        ["EJ S.A.", "3B", "EJ0003", "Mt", 1000, "EJ pair"],
        ["EJ S.A.", "EJLOT7", "EJLOT7", "Mt", 2100, "EJ fibre"],
        ["EJ S.A.", "EJLOT7", "EJLOT7", "Mt", 2100, "EJ fibre"],
        ["EJ S.A.", "EJLOT7", "EJLOT7", "Mt", 1045, "EJ fibre"],
        ["EJ S.A.", 11, "EJ0011", "Mt", 970, "EJ cable"],
      ],
    });

    expect(result.ok).toBe(true);
    const reels = result.ok ? result.reels : [];
    expect(
      reels.map((reel) => [reel.drum, reel.tag, reel.usedM, reel.tracked, reel.pieces]),
    ).toEqual([
      ["EJ0003", "3", 100, true, 1],
      ["EJ0003", "3B", 200, true, 1],
      ["EJLOT7", "EJLOT7", 6470, true, 3],
      ["EJ0011", "11", null, false, 1],
    ]);
  });

  it("joins a follow-up row without a drum to the one reel of the stock list with its tag", () => {
    const result = readExcelReels("INSTRUMENTATION", {
      tracking: [TRACKING_HEADER, tracking({ drum: "q", tag: "EJFO9", used: 5 })],
      stock: [IC_STOCK_HEADER, ["EJ S.A.", "EJFO9", "EJFO9", "Mt", 2100, "EJ fibre"]],
    });

    expect(result).toMatchObject({
      ok: true,
      reels: [{ drum: "EJFO9", tag: "EJFO9", usedM: 5, tracked: true, receivedM: 500 }],
    });
  });

  it("finds the header below a title row", () => {
    const result = readExcelReels("ELECTRICAL", {
      tracking: [["Seguimiento"], [], TRACKING_HEADER, tracking({ drum: "EX1", tag: 1 })],
      stock: null,
    });

    expect(result).toMatchObject({ ok: true, reels: [{ tag: "1" }] });
  });

  it("says which columns a sheet lacks, and reads nothing", () => {
    expect(
      readExcelReels("ELECTRICAL", {
        tracking: [TRACKING_HEADER.filter((name) => !name.startsWith("Metros Usados"))],
        stock: null,
      }),
    ).toEqual({ ok: false, sheet: "tracking", missingColumns: ["Metros Usados"] });
    expect(
      readExcelReels("ELECTRICAL", { tracking: null, stock: [["Description", "Meters"]] }),
    ).toEqual({ ok: false, sheet: "stock", missingColumns: ["… TAG NUMBER"] });
  });

  it("reads nothing, and no error, when the file has neither sheet", () => {
    expect(readExcelReels("ELECTRICAL", { tracking: null, stock: null })).toEqual({
      ok: true,
      reels: [],
      repeated: 0,
    });
  });
});

describe("excelReelSchema", () => {
  it("needs a drum or a tag", () => {
    const reel = { ...EMPTY, drum: null, tag: null, tracked: true, pieces: null };

    expect(excelReelSchema.safeParse(reel).success).toBe(false);
    expect(excelReelSchema.safeParse({ ...reel, tag: "26" }).success).toBe(true);
  });
});

describe("readExcelReelPulls", () => {
  const ELECTRICAL_PULLS = [
    "Cable Code",
    "TAG Cable",
    "Núm. Circt.",
    "Bobina Real",
    "star ",
    "end ",
    "pulled ",
    "fecha ",
  ];

  it("reads each core with its section, from its tag and not from «Núm. Circt.»", () => {
    const result = readExcelReelPulls("ELECTRICAL", [
      ELECTRICAL_PULLS,
      ["99XAA01W001", "99XAA01W001T3C2", 4, 26, 239, 191, 48, new Date(Date.UTC(2026, 6, 24))],
      // Un conductor por tender: sin bobina, no es una tirada.
      ["99XAA01W001", "99XAA01W001T4C1", 4, null, null, null, null, null],
      [null, null, null, 27, null, null, 10, null],
    ]);

    expect(result).toEqual({
      ok: true,
      pulls: [
        {
          row: 2,
          code: "99XAA01W001",
          conductor: "99XAA01W001T3C2",
          circuit: 3,
          tag: "26",
          drum: null,
          startM: 239,
          endM: 191,
          pulledM: 48,
          pulledOn: "2026-07-24",
        },
      ],
    });
  });

  it("reads the instrumentation pullings by the first column with each name", () => {
    const result = readExcelReelPulls("INSTRUMENTATION", [
      [
        "ID",
        "DATE",
        "CABLE TAG",
        "CABLE DRUM TAG",
        "PULLED [m]",
        "CABLE DRUM Nº",
        "DATE",
        "CABLE TAG",
      ],
      [1, new Date(Date.UTC(2026, 4, 9)), "99xab01-w8001", "3B", 57, "ej0003", null, "99OTRO"],
    ]);

    expect(result).toMatchObject({
      ok: true,
      pulls: [
        { code: "99XAB01-W8001", tag: "3B", drum: "EJ0003", pulledM: 57, pulledOn: "2026-05-09" },
      ],
    });
  });

  it("says which columns are missing", () => {
    expect(readExcelReelPulls("INSTRUMENTATION", [["DATE", "CABLE TAG", "PULLED [m]"]])).toEqual({
      ok: false,
      missingColumns: ["CABLE DRUM TAG"],
    });
  });
});
