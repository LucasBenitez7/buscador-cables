import { describe, expect, it } from "vitest";
import type { ProjectWire } from "../extract/schema";
import { mergeWires, sameRows, wireFromList, wiringChange, type StoredWire } from "./wiring";

const listed = (position: number, wire: string, cells: Partial<ProjectWire> = {}): ProjectWire => ({
  position,
  wire,
  colour: null,
  originBlock: "X51",
  originPoint: String(10 + position),
  destinationBlock: "JB-TB1",
  destinationPoint: String(20 + position),
  ...cells,
});

/** A stored wire as the list left it, with field corrections on top. */
const stored = (wire: ProjectWire, field: Partial<StoredWire> = {}): StoredWire => ({
  ...wireFromList(wire),
  ...field,
});

describe("mergeWires", () => {
  it("takes a new list as is", () => {
    const merge = mergeWires("99X", [], [listed(1, "BN"), listed(2, "BU")]);

    expect(merge.changed).toBe(true);
    expect(merge.wires).toEqual([wireFromList(listed(1, "BN")), wireFromList(listed(2, "BU"))]);
    expect(merge.issues).toEqual([]);
  });

  it("does nothing when the list did not change", () => {
    const current = [stored(listed(1, "BN"), { originPoint: "99" })];
    const merge = mergeWires("99X", current, [listed(1, "BN")]);

    expect(merge).toMatchObject({ changed: false, listCellsChanged: 0, issues: [] });
  });

  it("follows the list where nobody corrected the cell, and keeps the corrections", () => {
    const current = [stored(listed(1, "BN"), { originPoint: "14" })];
    const merge = mergeWires("99X", current, [
      listed(1, "BN", { originPoint: "12", destinationPoint: "30" }),
    ]);

    expect(merge.wires[0]).toMatchObject({
      originPoint: "14",
      pdfOriginPoint: "12",
      destinationPoint: "30",
      pdfDestinationPoint: "30",
    });
    expect(merge.listCellsChanged).toBe(2);
    expect(merge.issues).toEqual([
      "99X: hilo BN, borna de origen corregido en campo (14); el listado nuevo dice 12. No se cambia.",
    ]);
  });

  it("drops the corrections of a wire that changed label or left the list, and says so", () => {
    const current = [
      stored(listed(1, "BN"), { originPoint: "14" }),
      stored(listed(2, "BU"), { destinationBlock: null }),
      stored(listed(3, "SH")),
    ];
    const merge = mergeWires("99X", current, [listed(1, "BK")]);

    expect(merge.wires).toEqual([wireFromList(listed(1, "BK"))]);
    expect(merge.issues).toEqual([
      "99X: el hilo nº 1 era BN y ahora es BK; se pierden las bornas corregidas en campo. Revísalo.",
      "99X: el hilo BU (nº 2) ya no está en el listado; se pierden sus bornas corregidas en campo.",
    ]);
  });
});

describe("wiringChange", () => {
  it("counts wires, and the changed cells when the count is the same", () => {
    const one = mergeWires(
      "99X",
      [stored(listed(1, "BN"))],
      [listed(1, "BN", { originPoint: "1" })],
    );
    expect(wiringChange(1, one)).toEqual({
      from: "1 hilo",
      to: "1 hilo, 1 celda cambiada en el listado",
    });
    expect(wiringChange(0, mergeWires("99X", [], [listed(1, "BN"), listed(2, "BU")]))).toEqual({
      from: "0 hilos",
      to: "2 hilos",
    });
  });
});

describe("sameRows", () => {
  it("ignores the key order", () => {
    expect(sameRows([{ a: 1, b: 2 }], [{ b: 2, a: 1 }])).toBe(true);
    expect(sameRows([{ a: 1 }], [{ a: 2 }])).toBe(false);
    expect(sameRows([{ a: 1 }], [])).toBe(false);
  });
});
