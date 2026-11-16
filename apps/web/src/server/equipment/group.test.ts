import { describe, expect, it } from "vitest";
import {
  filterEquipmentGroups,
  groupEquipmentEnds,
  isEndConnected,
  type EquipmentCableInput,
} from "./group";

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

describe("filterEquipmentGroups", () => {
  const groups = groupEquipmentEnds("99BMA10", [
    cable({ id: "a", code: "99A", connectionStatus: "ORIGIN_ONLY", wires: [wire(1, "X51", "1")] }),
    cable({ id: "b", code: "99B", testStatus: "TESTED_OK", wires: [wire(1, "X51", "2")] }),
    cable({ id: "c", code: "99C", testStatus: "TESTED_FAILED", wires: [wire(1, "X52", "1")] }),
  ]);
  const codes = (search: Parameters<typeof filterEquipmentGroups>[1]) =>
    filterEquipmentGroups(groups, search).map((group) => [
      group.block,
      group.ends.map((end) => end.code),
    ]);

  it("keeps everything without filters", () => {
    expect(codes({})).toEqual([
      ["X51", ["99A", "99B"]],
      ["X52", ["99C"]],
    ]);
  });

  it("filters by code, state of this end, test and strip, and drops empty strips", () => {
    expect(codes({ q: "9b" })).toEqual([["X51", ["99B"]]]);
    expect(codes({ state: "connected" })).toEqual([["X51", ["99A"]]]);
    expect(codes({ state: "pending" })).toEqual([
      ["X51", ["99B"]],
      ["X52", ["99C"]],
    ]);
    expect(codes({ test: "failed" })).toEqual([["X52", ["99C"]]]);
    expect(codes({ test: "untested" })).toEqual([["X51", ["99A"]]]);
    expect(codes({ block: "X52" })).toEqual([["X52", ["99C"]]]);
  });

  it("orders inside each strip: by code or with the ends to connect first", () => {
    expect(codes({ sort: "pending" })[0]).toEqual(["X51", ["99B", "99A"]]);
    expect(codes({ sort: "code" })[0]).toEqual(["X51", ["99A", "99B"]]);
  });
});
