/**
 * How the connection crews see an equipment (cabinet, junction box, panel): the cables that
 * end in it, grouped by the terminal strip they land on, with the state of that end. Pure
 * functions, so they can be tested without a database.
 */
import type { ConnectionStatus, TestStatus, WiringEnd } from "@cables/shared";

export type EquipmentCableInput = {
  id: string;
  code: string;
  description: string | null;
  originEquipment: string | null;
  destinationEquipment: string | null;
  connectionStatus: ConnectionStatus;
  testStatus: TestStatus;
  wires: {
    position: number;
    originBlock: string | null;
    originPoint: string | null;
    destinationBlock: string | null;
    destinationPoint: string | null;
    pdfOriginBlock: string | null;
    pdfOriginPoint: string | null;
    pdfDestinationBlock: string | null;
    pdfDestinationPoint: string | null;
  }[];
};

/** One end of a cable that lands in the equipment. */
export type EquipmentEnd = {
  cableId: string;
  code: string;
  description: string | null;
  end: WiringEnd;
  /** The equipment at the other end of the cable. */
  otherEquipment: string | null;
  /** This end is connected (the cable's connection state, read for this end). */
  connected: boolean;
  testStatus: TestStatus;
  wires: number;
  /** Terminals of this end in table order, without repeats ("11", "12", "PE"). */
  points: string[];
  /** Some terminal of this end was corrected in the field. */
  editedInField: boolean;
};

export type EquipmentGroup = {
  /** Terminal strip; null when the list gives none for these ends. */
  block: string | null;
  ends: EquipmentEnd[];
};

const END_CONNECTED: Record<WiringEnd, readonly ConnectionStatus[]> = {
  origin: ["ORIGIN_ONLY", "CONNECTED"],
  destination: ["DESTINATION_ONLY", "CONNECTED"],
};

export const isEndConnected = (status: ConnectionStatus, end: WiringEnd) =>
  END_CONNECTED[end].includes(status);

const same = (a: string | null, b: string) => a !== null && a.toUpperCase() === b.toUpperCase();

/** "X51" < "X52" < "X100", and numbers inside codes in numeric order. */
const naturalOrder = new Intl.Collator("es", { numeric: true, sensitivity: "base" }).compare;

/** The strip most wires of the end use: a cable may also send its shield to "PE". */
function mainBlock(blocks: (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const block of blocks) if (block) counts.set(block, (counts.get(block) ?? 0) + 1);
  let best: string | null = null;
  for (const [block, count] of counts) {
    if (best === null || count > counts.get(best)!) best = block;
  }
  return best;
}

/**
 * The ends of `cables` that land in `equipment`, grouped by terminal strip: strips in natural
 * order and, inside each one, cables by their first terminal. A cable with both ends in the
 * same equipment appears twice, once per end.
 */
export function groupEquipmentEnds(
  equipment: string,
  cables: readonly EquipmentCableInput[],
): EquipmentGroup[] {
  const ends: (EquipmentEnd & { block: string | null })[] = [];
  for (const cable of cables) {
    for (const end of ["origin", "destination"] as const) {
      const here = end === "origin" ? cable.originEquipment : cable.destinationEquipment;
      if (!same(here, equipment)) continue;
      const block = (wire: EquipmentCableInput["wires"][number]) =>
        end === "origin" ? wire.originBlock : wire.destinationBlock;
      const point = (wire: EquipmentCableInput["wires"][number]) =>
        end === "origin" ? wire.originPoint : wire.destinationPoint;
      const edited = (wire: EquipmentCableInput["wires"][number]) =>
        end === "origin"
          ? wire.originBlock !== wire.pdfOriginBlock || wire.originPoint !== wire.pdfOriginPoint
          : wire.destinationBlock !== wire.pdfDestinationBlock ||
            wire.destinationPoint !== wire.pdfDestinationPoint;
      ends.push({
        cableId: cable.id,
        code: cable.code,
        description: cable.description,
        end,
        otherEquipment: end === "origin" ? cable.destinationEquipment : cable.originEquipment,
        connected: isEndConnected(cable.connectionStatus, end),
        testStatus: cable.testStatus,
        wires: cable.wires.length,
        points: [...new Set(cable.wires.flatMap((wire) => (point(wire) ? [point(wire)!] : [])))],
        editedInField: cable.wires.some(edited),
        block: mainBlock(cable.wires.map(block)),
      });
    }
  }

  const groups = new Map<string | null, EquipmentEnd[]>();
  for (const { block, ...end } of ends) groups.set(block, [...(groups.get(block) ?? []), end]);
  return [...groups.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : naturalOrder(a, b)))
    .map(([block, items]) => ({
      block,
      ends: items.sort(
        (a, b) =>
          naturalOrder(a.points[0] ?? "", b.points[0] ?? "") || naturalOrder(a.code, b.code),
      ),
    }));
}
