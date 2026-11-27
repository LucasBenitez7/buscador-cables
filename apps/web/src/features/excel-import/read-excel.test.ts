import { describe, expect, it, vi } from "vitest";
import { readExcelFile, type SheetNamesReader, type SheetReader } from "./read-excel";

// Datos inventados.
const file = (name: string) => new File(["x"], name);

const electricalHeader = [
  "Cable Code",
  "Estado cable (unificado)",
  "Fecha tendido",
  "Company Real",
  "Bobina usada",
  "Estado Bobina",
  "Cantidad de metros [REAL]",
  "Numero de secciones",
];

const instrumentationHeader = [
  "TAG",
  "ESTADO",
  "Fecha de tendido",
  "Company Real",
  "Bobina",
  "Bobina Real en campo",
  "Estado Bobina",
  "Connections Origin (ud)",
  "Connections Destination (ud)",
  "Conectores Instalados Origen",
  "Conectores Instalados Destino",
];

/** A reader that only knows the sheets it is given. */
const sheets =
  (tables: Record<string, unknown[][]>): SheetReader =>
  async (_file, sheet) =>
    (tables[sheet] as never) ?? null;

/** The names of those same sheets. */
const names =
  (tables: Record<string, unknown[][]>): SheetNamesReader =>
  async () =>
    Object.keys(tables);

/** Reads a file made of these sheets. */
const read = (name: string, tables: Record<string, unknown[][]>) =>
  readExcelFile(file(name), sheets(tables), names(tables));

describe("readExcelFile", () => {
  it("finds the electrical Excel by its sheet and reads the date of the file name", async () => {
    const result = await read("estado electrico rev2_16.11.26.xlsx", {
      "MASTER CABLE": [
        electricalHeader,
        ["ZZ-1", "Conectado", null, "Montajes Ficticios", "B-1", null, 40, 2],
        ["ZZ-2", "Check", null, null, null, null, null, null],
      ],
      "Table EMPRESA TOTAL (Format Orig)": [
        ["Cable Code", "Drum estimated"],
        ["ZZ-1", "B-8"],
      ],
      "Table EMPRESA TOTAL": [
        ["Cable Code", "Drum estimated", "Drum used"],
        ["ZZ-1", "B-7", "B-1"],
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      kind: "ELECTRICAL",
      excelDate: "2026-11-16",
      rows: [
        {
          code: "ZZ-1",
          connectionStatus: "CONNECTED",
          actualLengthM: 20,
          reel: "B-1",
          plannedReel: "B-7",
        },
      ],
      ignored: [{ code: "ZZ-2" }],
    });
  });

  it("finds the instrumentation Excel by any of its sheet names", async () => {
    const result = await read("instrumentacion.xlsx", {
      "Tabla IC Maestra": [instrumentationHeader, ["ZZ-3", "Tendido", null, null, "B-9"]],
      Table: [
        ["DATE", "CABLE TAG", "PULLED [m]"],
        [null, "ZZ-3", 47],
      ],
    });

    expect(result).toMatchObject({
      ok: true,
      kind: "INSTRUMENTATION",
      excelDate: null,
      rows: [{ code: "ZZ-3", actualLengthM: 47, plannedReel: "B-9", reel: null }],
      // Sin las hojas de bobinas, los cables se leen igual y el formulario dice por qué.
      reels: null,
      reelPulls: null,
      reelWarning: "Bobinas sin actualizar. Faltan columnas en la hoja «Table»: CABLE DRUM TAG.",
    });
  });

  it("reads the reels and their pullings, each sheet once", async () => {
    const tables = {
      "Tabl IC Maestra": [instrumentationHeader, ["ZZ-3", "Tendido", null, null, "EJ7"]],
      Table: [
        ["DATE", "CABLE TAG", "CABLE DRUM TAG", "CABLE DRUM Nº", "PULLED [m]"],
        [null, "ZZ-3", 7, "EJ7", 47],
      ],
      "Seguimientos Bobina cable": [
        [
          "Drum Identification",
          "EJ TAG NUMBER",
          "Metros Recibidos",
          "Metros Usados",
          "Metros Restantes",
          "Tiradas reales",
          "Tiradas pendientes",
        ],
        ["EJ7", 7, 500, 47, 453, 1, 0],
      ],
    };
    const reader = vi.fn(sheets(tables));

    const result = await readExcelFile(file("ic.xlsx"), reader, names(tables));

    expect(result).toMatchObject({
      ok: true,
      reels: [{ drum: "EJ7", tag: "7", usedM: 47, tracked: true }],
      reelPulls: [{ code: "ZZ-3", tag: "7", drum: "EJ7", pulledM: 47 }],
      reelWarning: null,
    });
    expect(reader.mock.calls.filter(([, sheet]) => sheet === "Table")).toHaveLength(1);
  });

  it("asks for the sheet of the pullings in the instrumentation Excel", async () => {
    const main = { "Tabl IC Maestra": [instrumentationHeader, ["ZZ-3", "Tendido"]] };

    expect(await readExcelFile(file("ic.xlsx"), sheets(main))).toEqual({
      ok: false,
      message: "El Excel no tiene la hoja «Table» con los metros tendidos.",
    });
    expect(
      await readExcelFile(file("ic.xlsx"), sheets({ ...main, Table: [["CABLE TAG", "DATE"]] })),
    ).toEqual({ ok: false, message: "Faltan columnas en la hoja «Table»: PULLED [m]." });
    // Si también fallan las columnas de la hoja principal, se dice eso primero.
    expect(
      await readExcelFile(file("ic.xlsx"), sheets({ "Tabl IC Maestra": [["TAG", "Fecha"]] })),
    ).toEqual({ ok: false, message: expect.stringContaining("«Tabl IC Maestra»: ESTADO") });
  });

  it("asks for the total table with the planned reels in the electrical Excel", async () => {
    const main = { "MASTER CABLE": [electricalHeader, ["ZZ-1", "No Tendido"]] };

    expect(await read("ele.xlsx", main)).toEqual({
      ok: false,
      message:
        "El Excel no tiene la hoja «Table … TOTAL» con las bobinas estimadas («Drum estimated»).",
    });
    expect(
      await read("ele.xlsx", { ...main, "Tabla OTRA Total": [["Cable Code", "Drum used"]] }),
    ).toEqual({
      ok: false,
      message: "Faltan columnas en la hoja «Tabla OTRA Total»: Drum estimated.",
    });
  });

  it("says which columns are missing, and that the sheet is not there", async () => {
    expect(
      await readExcelFile(file("a.xlsx"), sheets({ "MASTER CABLE": [["Cable Code"]] })),
    ).toEqual({
      ok: false,
      message: expect.stringContaining("Estado cable (unificado)"),
    });
    expect(await readExcelFile(file("a.xlsx"), sheets({}))).toEqual({
      ok: false,
      message: "El Excel no tiene la hoja «MASTER CABLE» o «Tabl IC Maestra».",
    });
  });

  it("does not break on a file that is not an Excel", async () => {
    const broken: SheetReader = vi.fn().mockRejectedValue(new Error("zip"));

    expect(await readExcelFile(file("foto.png"), broken)).toEqual({
      ok: false,
      message: "No se pudo leer el archivo. Comprueba que es un Excel (.xlsx).",
    });
  });
});
