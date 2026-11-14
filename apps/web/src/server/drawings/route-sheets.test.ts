// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildRouteSheets, type SheetRow } from "./route-sheets";

vi.mock("@cables/db", () => ({ prisma: {} }));

const sheet = (key: string) => ({
  key,
  drawing: `EJ-ELE-DRW-00${key}`,
  sheet: "02",
  title: null,
  width: 2384,
  height: 1684,
});
const row = (trayCode: string, key: string, marks: unknown): SheetRow => ({
  trayCode,
  marks,
  sheet: sheet(key),
});
const flag = (x: number, y = 0.5) => ({ x, y, kind: "flag" as const });

const route = [
  { trayCode: "99UXA00L21001" },
  { trayCode: "99UXA00L21002" },
  { trayCode: "99UXA00L21003" },
];

describe("buildRouteSheets", () => {
  it("numbers the route trays and colours them by how far the cable got", () => {
    const [only] = buildRouteSheets(
      [
        row("99UXA00L21001", "24", [flag(0.1)]),
        row("99UXA00L21002", "24", [flag(0.2), { x: 0.9, y: 0.9, kind: "table" }]),
        row("99UXA00L21003", "24", [flag(0.3)]),
      ],
      route,
      {
        installationStatus: "PARTIALLY_LAID",
        looseEnd: "DESTINATION",
        looseEndTray: "99UXA00L21002",
      },
    );

    // Primero donde está la punta; las filas de tabla no cuentan.
    expect(only!.marks).toEqual([
      { ...flag(0.2), label: "2", tone: "warning" },
      { ...flag(0.1), label: "1", tone: "success" },
      { ...flag(0.3), label: "3", tone: "muted" },
    ]);
    expect(only).toMatchObject({ trays: 3, hasLooseEnd: true });
  });

  it("merges trays that share a section flag into one mark", () => {
    const [only] = buildRouteSheets(
      [row("99UXA00L21001", "24", [flag(0.5)]), row("99UXA00L21002", "24", [flag(0.5)])],
      route,
      { installationStatus: "LAID", looseEnd: null, looseEndTray: null },
    );

    expect(only!.marks).toEqual([{ ...flag(0.5), label: "1, 2", tone: "success" }]);
  });

  it("puts first the sheet where the loose end is, then the ones with more trays", () => {
    const sheets = buildRouteSheets(
      [
        row("99UXA00L21001", "10", [flag(0.1)]),
        row("99UXA00L21002", "10", [flag(0.2)]),
        row("99UXA00L21003", "20", [flag(0.3)]),
        // Encontrado fuera del recorrido: se marca como "Aquí".
        row("99UXB00L22001", "20", [flag(0.4)]),
      ],
      route,
      { installationStatus: "PARTIALLY_LAID", looseEnd: "ORIGIN", looseEndTray: "99UXB00L22001" },
    );

    expect(sheets.map((item) => item.key)).toEqual(["20", "10"]);
    expect(sheets[0]!.marks[0]).toMatchObject({ label: "Aquí", tone: "warning" });
  });

  it("leaves out sheets where the route trays only appear in a table", () => {
    expect(
      buildRouteSheets([row("99UXA00L21001", "10", [{ x: 0.1, y: 0.1, kind: "table" }])], route, {
        installationStatus: "UNVERIFIED",
        looseEnd: null,
        looseEndTray: null,
      }),
    ).toEqual([]);
  });
});
