import { describe, expect, it } from "vitest";
import type { DrawnTag } from "../parse/drawing-marks";
import { buildEquipment, equipmentKey } from "./equipment";

// Datos inventados: unidad 99 y planos «EJ».
const tag = (text: string, x = 0.5): DrawnTag => ({ tag: text, x, y: 0.5, w: 0.02, h: 0.01 });
const sheet = (number: string, tags: DrawnTag[], drawing = "EJ-ICO-DRW-0001") => ({
  drawing,
  sheet: number,
  page: Number(number),
  tags,
});
const cable = (origin: string | null, destination: string | null = null) => ({
  origin: {
    equipment: origin,
    cubicle: null,
    gland: null,
    functionKks: null,
    installationKks: null,
    room: null,
  },
  destination: {
    equipment: destination,
    cubicle: null,
    gland: null,
    functionKks: null,
    installationKks: null,
    room: null,
  },
});

describe("equipmentKey", () => {
  it("compares tags in capitals without the installation mark", () => {
    expect(equipmentKey(" +99bmd04 ")).toBe("99BMD04");
    expect(equipmentKey("99CJU04,99CJU15")).toBeNull();
    expect(equipmentKey("  ")).toBeNull();
  });
});

describe("buildEquipment", () => {
  it("finds an equipment where its tag is written, sheet by sheet", () => {
    const { equipment, stats } = buildEquipment(
      [sheet("02", [tag("99CJU17"), tag("99CJU17", 0.7)]), sheet("03", [tag("99CJU17")])],
      [cable("99CJU17"), cable(null, "99CJU17")],
      new Map([["EJ-ICO-DRW-0001#02", "AREA 1"]]),
    );

    expect(stats).toEqual({ total: 1, exact: 1, related: 0 });
    expect(equipment).toEqual([
      {
        tag: "99CJU17",
        drawings: [
          {
            drawing: "EJ-ICO-DRW-0001",
            sheet: "02",
            title: "AREA 1",
            sourcePage: 2,
            drawnAs: "99CJU17",
            marks: [
              { x: 0.5, y: 0.5, w: 0.02, h: 0.01, kind: "label" },
              { x: 0.7, y: 0.5, w: 0.02, h: 0.01, kind: "label" },
            ],
          },
          expect.objectContaining({ sheet: "03", title: null }),
        ],
      },
    ]);
  });

  it("takes the instrument when the drawing leaves out the part, never a bare system", () => {
    const { equipment, stats } = buildEquipment(
      [sheet("02", [tag("99LCA70CF001A1"), tag("99LCA70")])],
      [cable("99LCA70CF001A1-B01"), cable("99LCA71CF002-B01"), cable("99LCA70CP009")],
      new Map(),
    );

    expect(stats).toEqual({ total: 3, exact: 0, related: 1 });
    expect(equipment).toMatchObject([
      { tag: "99LCA70CF001A1-B01", drawings: [{ drawnAs: "99LCA70CF001A1" }] },
    ]);
  });

  it("keeps the tag as the lists write it and counts each sheet once", () => {
    const { equipment } = buildEquipment(
      [sheet("02", [tag("99BMD04")]), sheet("02", [tag("99BMD04")])],
      [cable("+99BMD04")],
      new Map(),
    );

    expect(equipment).toMatchObject([{ tag: "+99BMD04", drawings: [{ marks: [{}] }] }]);
  });

  it("keeps at most 20 marks of one equipment on one sheet", () => {
    const many = Array.from({ length: 30 }, (_, index) => tag("99CJU17", index / 100));
    const { equipment } = buildEquipment([sheet("02", many)], [cable("99CJU17")], new Map());

    expect(equipment[0]!.drawings[0]!.marks).toHaveLength(20);
  });
});
