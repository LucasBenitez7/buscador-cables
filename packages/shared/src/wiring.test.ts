import { describe, expect, it } from "vitest";
import { describeCableEvent } from "./cable-history";
import {
  countWiringChanges,
  describeDuplicate,
  describeWiringEdit,
  findDuplicateTerminals,
  formatTerminal,
  isFieldEdited,
  wiringChangeKey,
  wiringChanges,
  wiringEditSchema,
  type WireRow,
} from "./wiring";

const wire = (position: number, label: string, cells: Partial<WireRow> = {}): WireRow => ({
  position,
  wire: label,
  colour: null,
  originBlock: "X51",
  originPoint: String(position),
  destinationBlock: "JB-TB1",
  destinationPoint: String(position + 20),
  pdfOriginBlock: "X51",
  pdfOriginPoint: String(position),
  pdfDestinationBlock: "JB-TB1",
  pdfDestinationPoint: String(position + 20),
  ...cells,
});

describe("wiringEditSchema", () => {
  const valid = {
    cableId: "c1",
    version: 3,
    wires: [
      {
        position: 1,
        originBlock: "  X51 ",
        originPoint: "11",
        destinationBlock: "",
        destinationPoint: null,
      },
    ],
  };

  it("trims cells, empties blank ones and defaults the confirmation to false", () => {
    expect(wiringEditSchema.parse(valid)).toEqual({
      cableId: "c1",
      version: 3,
      confirmDuplicates: false,
      notes: null,
      wires: [
        {
          position: 1,
          originBlock: "X51",
          originPoint: "11",
          destinationBlock: null,
          destinationPoint: null,
        },
      ],
    });
  });

  it("rejects markup, control characters, long cells and repeated wires", () => {
    const withCell = (originPoint: string) => ({
      ...valid,
      wires: [{ ...valid.wires[0]!, originPoint }],
    });
    expect(wiringEditSchema.safeParse(withCell("<b>1</b>")).success).toBe(false);
    expect(wiringEditSchema.safeParse(withCell("1\u0007")).success).toBe(false);
    expect(wiringEditSchema.safeParse(withCell("x".repeat(121))).success).toBe(false);
    expect(
      wiringEditSchema.safeParse({ ...valid, wires: [valid.wires[0], valid.wires[0]] }).success,
    ).toBe(false);
    expect(wiringEditSchema.safeParse({ ...valid, wires: [] }).success).toBe(false);
  });
});

describe("findDuplicateTerminals", () => {
  it("finds two wires of the same end in the same terminal, ignoring case", () => {
    const wires = [wire(1, "1+"), wire(2, "1-", { originBlock: "x51", originPoint: "1" })];

    expect(findDuplicateTerminals(wires)).toEqual([
      { end: "origin", block: "X51", point: "1", wires: ["1+", "1-"] },
    ]);
  });

  it("does not mix the ends, nor strips, and ignores empty terminals", () => {
    const wires = [
      wire(1, "1+", { destinationPoint: "5" }),
      wire(2, "1-", { originPoint: "5", originBlock: "X52" }),
      wire(3, "SH", { originPoint: null, destinationPoint: null }),
      wire(4, "YG", { originPoint: null, destinationPoint: null }),
    ];

    expect(findDuplicateTerminals(wires)).toEqual([]);
  });

  it("only reports duplicates that involve a wire touched in this edit", () => {
    const wires = [
      wire(1, "SH", { originBlock: null, originPoint: "PE" }),
      wire(2, "YG", { originBlock: null, originPoint: "PE" }),
      wire(3, "BN", { destinationPoint: "40" }),
    ];

    expect(findDuplicateTerminals(wires, new Set([3]))).toEqual([]);
    expect(findDuplicateTerminals(wires, new Set([2]))).toEqual([
      { end: "origin", block: null, point: "PE", wires: ["SH", "YG"] },
    ]);
  });

  it("reads as a sentence", () => {
    expect(
      describeDuplicate({ end: "origin", block: "X51", point: "11", wires: ["1+", "1-", "SH"] }),
    ).toBe("Origen: el 1+, el 1- y el SH van a X51 · 11.");
    expect(
      describeDuplicate({ end: "destination", block: null, point: "PE", wires: ["SH", "YG"] }),
    ).toBe("Destino: el SH y el YG van a PE.");
  });
});

describe("cells and terminals", () => {
  it("knows which cells were corrected in the field", () => {
    const edited = wire(1, "1+", { originPoint: "14" });
    expect(isFieldEdited(edited, "originPoint")).toBe(true);
    expect(isFieldEdited(edited, "originBlock")).toBe(false);
  });

  it("formats a terminal", () => {
    expect(formatTerminal("X51", "11")).toBe("X51 · 11");
    expect(formatTerminal(null, "PE")).toBe("PE");
    expect(formatTerminal(null, null)).toBe("—");
  });
});

describe("wiring history", () => {
  const changes = {
    [wiringChangeKey(10, "destinationPoint")]: { from: "30", to: "31", wire: "5-" },
    [wiringChangeKey(2, "originPoint")]: { from: "2", to: "4", wire: "1-" },
    [wiringChangeKey(2, "originBlock")]: { from: "X51", to: "X52", wire: "1-" },
    [wiringChangeKey(3, "originPoint")]: { from: "3", to: null, wire: "2+" },
    connectionStatus: { from: "DISCONNECTED", to: "ORIGIN_ONLY" },
  };

  it("lists the changed cells in table order and skips other changes", () => {
    expect(wiringChanges(changes).map((change) => `${change.position}.${change.field}`)).toEqual([
      "2.originBlock",
      "2.originPoint",
      "3.originPoint",
      "10.destinationPoint",
    ]);
    expect(wiringChanges(null)).toEqual([]);
  });

  it("counts wires per end, once per wire", () => {
    expect(countWiringChanges(changes)).toEqual({ origin: 2, destination: 1 });
  });

  it("sums the edit up in one line", () => {
    expect(describeWiringEdit(changes)).toBe(
      "corrigió las bornas de 2 hilos en origen y 1 en destino",
    );
    expect(
      describeWiringEdit({ [wiringChangeKey(1, "originPoint")]: changes["wire.2.originPoint"] }),
    ).toBe("corrigió las bornas de 1 hilo en origen");
    expect(
      describeCableEvent({
        action: "WIRING_EDITED",
        changes,
        fromLocation: null,
        toLocation: null,
      }),
    ).toBe("corrigió las bornas de 2 hilos en origen y 1 en destino");
  });
});
