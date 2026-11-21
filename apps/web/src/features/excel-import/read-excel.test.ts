import { describe, expect, it, vi } from "vitest";
import { readExcelFile, type SheetReader } from "./read-excel";

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

describe("readExcelFile", () => {
  it("finds the electrical Excel by its sheet and reads the date of the file name", async () => {
    const result = await readExcelFile(
      file("estado electrico rev2_16.11.26.xlsx"),
      sheets({
        "MASTER CABLE": [
          electricalHeader,
          ["ZZ-1", "Conectado", null, "Montajes Ficticios", "B-1", null, 40, 2],
          ["ZZ-2", "Check", null, null, null, null, null, null],
        ],
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      kind: "ELECTRICAL",
      excelDate: "2026-11-16",
      rows: [{ code: "ZZ-1", connectionStatus: "CONNECTED", actualLengthM: 20 }],
      ignored: [{ code: "ZZ-2" }],
    });
  });

  it("finds the instrumentation Excel by any of its sheet names", async () => {
    const result = await readExcelFile(
      file("instrumentacion.xlsx"),
      sheets({
        "Tabla IC Maestra": [instrumentationHeader, ["ZZ-3", "Tendido"]],
        Table: [
          ["DATE", "CABLE TAG", "PULLED [m]"],
          [null, "ZZ-3", 47],
        ],
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      kind: "INSTRUMENTATION",
      excelDate: null,
      rows: [{ code: "ZZ-3", actualLengthM: 47 }],
    });
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
