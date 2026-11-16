import { describe, expect, it } from "vitest";
import { groupEquipmentEnds, isEndConnected, type EquipmentCableInput } from "./group";

const wire = (
  position: number,
  originBlock: string | null,
  originPoint: string | null,
  destinationBlock: string | null = "JB-TB1",
  destinationPoint: string | null = String(position),
) => ({
  position,
  originBlock,
  originPoint,
  destinationBlock,
  destinationPoint,
  pdfOriginBlock: originBlock,
  pdfOriginPoint: originPoint,
  pdfDestinationBlock: destinationBlock,
  pdfDestinationPoint: destinationPoint,
});

const cable = (overrides: Partial<EquipmentCableInput>): EquipmentCableInput => ({
  id: "c",
  code: "99X",
  description: null,
  originEquipment: "99BMA10",
  destinationEquipment: "99CXJ11",
  connectionStatus: "DISCONNECTED",
  testStatus: "NOT_TESTED",
  wires: [],
  ...overrides,
});

describe("isEndConnected", () => {
  it("reads the state of one end", () => {
    expect(isEndConnected("ORIGIN_ONLY", "origin")).toBe(true);
    expect(isEndConnected("ORIGIN_ONLY", "destination")).toBe(false);
    expect(isEndConnected("CONNECTED", "destination")).toBe(true);
    expect(isEndConnected("DISCONNECTED", "origin")).toBe(false);
  });
});

describe("groupEquipmentEnds", () => {
  it("groups the ends by their main strip, in natural order, with the cables by first terminal", () => {
    const groups = groupEquipmentEnds("99bma10", [
      cable({
        id: "a",
        code: "99A",
        connectionStatus: "ORIGIN_ONLY",
        wires: [wire(1, "X100", "5"), wire(2, "X100", "6")],
      }),
      cable({
        id: "b",
        code: "99B",
        wires: [wire(1, "X51", "21"), wire(2, "X51", "22"), wire(3, null, "PE")],
      }),
      cable({ id: "c", code: "99C", wires: [wire(1, "X51", "3")] }),
      cable({ id: "d", code: "99D", wires: [] }),
      cable({ id: "e", code: "99E", originEquipment: "99OTRO" }),
    ]);

    expect(groups.map((group) => [group.block, group.ends.map((end) => end.code)])).toEqual([
      ["X51", ["99C", "99B"]],
      ["X100", ["99A"]],
      [null, ["99D"]],
    ]);
    expect(groups[0]!.ends[1]).toMatchObject({
      end: "origin",
      otherEquipment: "99CXJ11",
      connected: false,
      wires: 3,
      points: ["21", "22", "PE"],
      editedInField: false,
    });
    expect(groups[1]!.ends[0]).toMatchObject({ connected: true });
  });

  it("lists a cable with both ends in the equipment once per end, and flags field corrections", () => {
    const corrected = { ...wire(1, "X1", "1", "X2", "2"), destinationPoint: "9" };
    const groups = groupEquipmentEnds("99BMA10", [
      cable({
        originEquipment: "99BMA10",
        destinationEquipment: "99BMA10",
        connectionStatus: "DESTINATION_ONLY",
        wires: [corrected],
      }),
    ]);

    expect(
      groups.flatMap((group) =>
        group.ends.map((end) => [end.end, end.connected, end.editedInField]),
      ),
    ).toEqual([
      ["origin", false, false],
      ["destination", true, true],
    ]);
  });
});
