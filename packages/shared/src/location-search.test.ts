import { describe, expect, it } from "vitest";
import type { LocationNode } from "./locations";
import {
  filterLocationTree,
  foldSearchText,
  parseLocationSearch,
  sortLocationTree,
} from "./location-search";

type Item = LocationNode<{
  id: string;
  name: string;
  code: string;
  type: "PLANT" | "AREA" | "UNIT" | "SITE";
  parentId: string | null;
  path: string;
  cableCount: number;
}>;

function node(
  id: string,
  name: string,
  code: string,
  type: Item["type"],
  cableCount: number,
  children: Item[] = [],
): Item {
  return { id, name, code, type, parentId: null, path: `/${code}`, cableCount, children };
}

// Planta Norte ─┬─ Área de Calderas ── Reactor X (con cables)
//               └─ Área Turbinas (sin cables)
// Planta Sur ── Área Sala de control (sin cables)
const tree: Item[] = [
  node("n", "Planta Norte", "PN", "PLANT", 3, [
    node("cal", "Área de Calderas", "A-CAL", "AREA", 3, [
      node("rx", "Reactor X", "R-X", "UNIT", 3),
    ]),
    node("tur", "Área Turbinas", "A-TUR", "AREA", 0),
  ]),
  node("s", "Planta Sur", "PS", "PLANT", 0, [node("ctl", "Sala de control", "SALA", "AREA", 0)]),
];

describe("parseLocationSearch", () => {
  it("reads the filters and the order, and ignores invalid ones", () => {
    expect(
      parseLocationSearch({ q: "  reactor ", type: "UNIT", cables: "1", sort: "cables" }),
    ).toEqual({ q: "reactor", type: "UNIT", cables: true, sort: "cables" });
    expect(parseLocationSearch({ type: "ROOM", cables: "yes", sort: "random" })).toEqual({});
    expect(parseLocationSearch({ q: "x".repeat(81) })).toEqual({});
    expect(parseLocationSearch({ q: "   " })).toEqual({});
  });
});

describe("foldSearchText", () => {
  it("ignores accents and case", () => {
    expect(foldSearchText("Área de Calderas")).toBe("area de calderas");
    expect(foldSearchText("Sala")).toBe(foldSearchText("sálA"));
  });
});

describe("filterLocationTree", () => {
  it("keeps every location when there is no criterion", () => {
    const result = filterLocationTree(tree, {});

    expect(result.matches).toHaveLength(6);
    expect(result.tree).toEqual(tree);
  });

  it("keeps the matches with their ancestors, and lists only the matches", () => {
    const result = filterLocationTree(tree, { q: "reactor" });

    expect(result.matches).toEqual(["rx"]);
    expect(result.tree.map((root) => root.id)).toEqual(["n"]);
    expect(result.tree[0]?.children.map((area) => area.id)).toEqual(["cal"]);
    expect(result.tree[0]?.children[0]?.children.map((unit) => unit.id)).toEqual(["rx"]);
  });

  it("matches the name and the code, without accents", () => {
    expect(filterLocationTree(tree, { q: "CALDERAS" }).matches).toEqual(["cal"]);
    expect(filterLocationTree(tree, { q: "a-tur" }).matches).toEqual(["tur"]);
    expect(filterLocationTree(tree, { q: "turbinas" }).matches).toEqual(["tur"]);
    expect(filterLocationTree(tree, { q: "no existe" })).toEqual({ tree: [], matches: [] });
  });

  it("filters by type", () => {
    expect(filterLocationTree(tree, { type: "PLANT" }).matches).toEqual(["n", "s"]);
    expect(filterLocationTree(tree, { type: "UNIT" }).tree[0]?.children[0]?.children).toHaveLength(
      1,
    );
  });

  it("keeps only the locations with cables, and their ancestors", () => {
    const result = filterLocationTree(tree, { cables: true });

    expect(result.matches).toEqual(["n", "cal", "rx"]);
    expect(result.tree.map((root) => root.id)).toEqual(["n"]);
    expect(result.tree[0]?.children.map((area) => area.id)).toEqual(["cal"]);
  });

  it("combines the criteria: all of them must hold on the same location", () => {
    expect(filterLocationTree(tree, { q: "sala", cables: true })).toEqual({
      tree: [],
      matches: [],
    });
  });
});

describe("sortLocationTree", () => {
  const names = (nodes: Item[]) => nodes.map((item) => item.name);

  it("sorts the siblings at every level by name, by code or by cables", () => {
    expect(names(sortLocationTree(tree, "name"))).toEqual(["Planta Norte", "Planta Sur"]);
    expect(names(sortLocationTree(tree, "cables"))).toEqual(["Planta Norte", "Planta Sur"]);
    expect(names(sortLocationTree(tree, "code"))).toEqual(["Planta Norte", "Planta Sur"]);

    const north = sortLocationTree(tree, "code")[0]!;
    expect(names(north.children)).toEqual(["Área de Calderas", "Área Turbinas"]);
    expect(names(sortLocationTree(tree, "name")[0]!.children)).toEqual([
      "Área de Calderas",
      "Área Turbinas",
    ]);
  });

  it("puts the most cables first, then by name", () => {
    const flat = [
      node("a", "Alfa", "A", "AREA", 0),
      node("b", "Beta", "B", "AREA", 5),
      node("c", "Gamma", "C", "AREA", 5),
    ];

    expect(names(sortLocationTree(flat, "cables"))).toEqual(["Beta", "Gamma", "Alfa"]);
  });

  it("does not change the tree it was given", () => {
    const before = JSON.stringify(tree);
    sortLocationTree(tree, "code");
    expect(JSON.stringify(tree)).toBe(before);
  });
});
