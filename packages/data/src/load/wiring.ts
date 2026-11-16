/**
 * Merges the wiring of a new revision of the lists with what is in the database. The lists
 * win, except for a cell somebody corrected in the field with the edit mode: that one is kept
 * (and reported if the list changed it too). See docs/PLAN.md, fase 11.
 */
import { WIRING_FIELDS, WIRING_FIELD_LABELS, type WiringField } from "@cables/shared";
import type { ProjectJumper, ProjectWire } from "../extract/schema";

export type StoredWire = {
  position: number;
  wire: string;
  colour: string | null;
  originBlock: string | null;
  originPoint: string | null;
  destinationBlock: string | null;
  destinationPoint: string | null;
  pdfOriginBlock: string | null;
  pdfOriginPoint: string | null;
  pdfDestinationBlock: string | null;
  pdfDestinationPoint: string | null;
};

export type StoredJumper = ProjectJumper;

const PDF: Record<WiringField, keyof StoredWire> = {
  originBlock: "pdfOriginBlock",
  originPoint: "pdfOriginPoint",
  destinationBlock: "pdfDestinationBlock",
  destinationPoint: "pdfDestinationPoint",
};

/** A new wire, straight from the list: the field says what the list says. */
export function wireFromList(wire: ProjectWire): StoredWire {
  return {
    position: wire.position,
    wire: wire.wire,
    colour: wire.colour,
    originBlock: wire.originBlock,
    originPoint: wire.originPoint,
    destinationBlock: wire.destinationBlock,
    destinationPoint: wire.destinationPoint,
    pdfOriginBlock: wire.originBlock,
    pdfOriginPoint: wire.originPoint,
    pdfDestinationBlock: wire.destinationBlock,
    pdfDestinationPoint: wire.destinationPoint,
  };
}

const edited = (wire: StoredWire, field: WiringField) => wire[field] !== wire[PDF[field]];
const hasEdits = (wire: StoredWire) => WIRING_FIELDS.some((field) => edited(wire, field));
const text = (value: string | null) => value ?? "vacío";

export type WiringMerge = {
  wires: StoredWire[];
  /** Something changed: the rows must be written again. */
  changed: boolean;
  /** Cells of the list that changed (new, removed or different), for the history line. */
  listCellsChanged: number;
  /** Why a field correction was kept or lost, for the load report. */
  issues: string[];
};

/**
 * A wire is the same if it keeps its position and its label. Its field corrections survive a
 * new revision; the list values (`pdf…`) are always updated.
 */
export function mergeWires(
  code: string,
  current: readonly StoredWire[],
  listed: readonly ProjectWire[],
): WiringMerge {
  const byPosition = new Map(current.map((wire) => [wire.position, wire]));
  const issues: string[] = [];
  let listCellsChanged = 0;

  const wires = listed.map((wire) => {
    const fresh = wireFromList(wire);
    const before = byPosition.get(wire.position);
    if (!before) {
      listCellsChanged += WIRING_FIELDS.length;
      return fresh;
    }
    if (before.wire !== wire.wire) {
      listCellsChanged += WIRING_FIELDS.length;
      if (hasEdits(before)) {
        issues.push(
          `${code}: el hilo nº ${wire.position} era ${before.wire} y ahora es ${wire.wire}; se pierden las bornas corregidas en campo. Revísalo.`,
        );
      }
      return fresh;
    }
    const merged: StoredWire = { ...fresh };
    for (const field of WIRING_FIELDS) {
      const listChanged = before[PDF[field]] !== fresh[PDF[field]];
      if (listChanged) listCellsChanged += 1;
      if (!edited(before, field)) continue;
      merged[field] = before[field];
      if (listChanged) {
        issues.push(
          `${code}: hilo ${wire.wire}, ${WIRING_FIELD_LABELS[field].toLowerCase()} corregido en campo (${text(before[field])}); el listado nuevo dice ${text(fresh[PDF[field]] as string | null)}. No se cambia.`,
        );
      }
    }
    return merged;
  });

  for (const before of current) {
    if (before.position <= listed.length) continue;
    listCellsChanged += WIRING_FIELDS.length;
    if (hasEdits(before)) {
      issues.push(
        `${code}: el hilo ${before.wire} (nº ${before.position}) ya no está en el listado; se pierden sus bornas corregidas en campo.`,
      );
    }
  }

  const changed = !sameRows(wires, current);
  return { wires, changed, listCellsChanged, issues };
}

/** Same rows, field by field: the database does not promise the key order of a row. */
export function sameRows<T extends object>(a: readonly T[], b: readonly T[]): boolean {
  return (
    a.length === b.length &&
    a.every((row, index) => {
      const other = b[index]!;
      const keys = new Set([...Object.keys(row), ...Object.keys(other)]);
      return [...keys].every((key) => row[key as keyof T] === other[key as keyof T]);
    })
  );
}

/** The history line of a load that changed the wiring: "4 hilos → 4 hilos, 2 bornas". */
export function wiringChange(before: number, merge: WiringMerge) {
  const after = merge.wires.length;
  const count = (n: number) => (n === 1 ? "1 hilo" : `${n} hilos`);
  return {
    from: count(before),
    to:
      before === after
        ? `${count(after)}, ${merge.listCellsChanged} ${merge.listCellsChanged === 1 ? "celda cambiada" : "celdas cambiadas"} en el listado`
        : count(after),
  };
}
