import { describe, expect, it } from "vitest";
import {
  buildLocationPath,
  buildLocationTree,
  childLocationType,
  createLocationSchema,
  isWithinPath,
  listMoveTargets,
  moveLocationSchema,
  parentLocationType,
  rebasePath,
  updateLocationSchema,
  validateLocationPlacement,
  type FlatLocation,
} from "./locations";

describe("childLocationType", () => {
  it("follows Planta → Área → Unidad → Sitio", () => {
    expect(childLocationType("PLANT")).toBe("AREA");
    expect(childLocationType("AREA")).toBe("UNIT");
    expect(childLocationType("UNIT")).toBe("SITE");
    expect(childLocationType("SITE")).toBeNull();
  });
});

describe("validateLocationPlacement", () => {
  it("only allows plants at the root", () => {
    expect(validateLocationPlacement("PLANT", null)).toBeNull();
    expect(validateLocationPlacement("AREA", null)).toMatch(/Solo las plantas/);
  });

  it("requires exactly the next level under a parent", () => {
    expect(validateLocationPlacement("AREA", "PLANT")).toBeNull();
    expect(validateLocationPlacement("SITE", "UNIT")).toBeNull();
    expect(validateLocationPlacement("UNIT", "PLANT")).toMatch(/solo se puede crear: área/);
    expect(validateLocationPlacement("PLANT", "AREA")).not.toBeNull();
  });

  it("does not allow children under a site", () => {
    expect(validateLocationPlacement("SITE", "SITE")).toMatch(/sitio no puede contener/);
  });
});

describe("paths", () => {
  it("builds paths from codes", () => {
    expect(buildLocationPath(null, "PL")).toBe("/PL");
    expect(buildLocationPath("/PL/A1", "R-X")).toBe("/PL/A1/R-X");
  });

  it("detects subtrees without matching siblings that share a prefix", () => {
    expect(isWithinPath("/PL/A1", "/PL/A1")).toBe(true);
    expect(isWithinPath("/PL/A1/R-X", "/PL/A1")).toBe(true);
    expect(isWithinPath("/PL/A10", "/PL/A1")).toBe(false);
  });

  it("rebases descendants when a code changes", () => {
    expect(rebasePath("/PL/A1/R-X", "/PL/A1", "/PL/AREA-1")).toBe("/PL/AREA-1/R-X");
    expect(rebasePath("/PL/A1", "/PL/A1", "/PL/AREA-1")).toBe("/PL/AREA-1");
    expect(() => rebasePath("/PL/A10", "/PL/A1", "/X")).toThrow();
  });
});

describe("location schemas", () => {
  it("normalizes the code to upper case", () => {
    const parsed = createLocationSchema.parse({
      name: " Reactor X ",
      code: " r-x ",
      type: "UNIT",
      parentId: "a1",
    });

    expect(parsed).toMatchObject({ name: "Reactor X", code: "R-X" });
  });

  it.each(["A/B", "A_B", "A%", "-A", "", "A B"])("rejects the code %j", (code) => {
    expect(updateLocationSchema.safeParse({ id: "l1", name: "X", code }).success).toBe(false);
  });

  it("accepts a root without parent", () => {
    expect(
      createLocationSchema.safeParse({ name: "Planta", code: "PL", type: "PLANT", parentId: null })
        .success,
    ).toBe(true);
  });
});

describe("buildLocationTree", () => {
  const flat: FlatLocation[] = [
    {
      id: "s",
      name: "Sitio XZ",
      code: "S-XZ",
      type: "SITE",
      parentId: "u",
      path: "/PL/A1/R-X/S-XZ",
    },
    { id: "a10", name: "Área 10", code: "A10", type: "AREA", parentId: "p", path: "/PL/A10" },
    { id: "u", name: "Reactor X", code: "R-X", type: "UNIT", parentId: "a2", path: "/PL/A1/R-X" },
    { id: "p", name: "Planta", code: "PL", type: "PLANT", parentId: null, path: "/PL" },
    { id: "a2", name: "Área 2", code: "A2", type: "AREA", parentId: "p", path: "/PL/A2" },
  ];

  it("nests children and sorts siblings naturally", () => {
    const [plant] = buildLocationTree(flat);

    expect(plant?.id).toBe("p");
    expect(plant?.children.map((node) => node.name)).toEqual(["Área 2", "Área 10"]);
    expect(plant?.children[0]?.children[0]?.children[0]?.id).toBe("s");
  });

  it("keeps orphans as roots instead of losing them", () => {
    const roots = buildLocationTree([{ ...flat[0]!, parentId: "missing" }]);

    expect(roots.map((node) => node.id)).toEqual(["s"]);
  });
});

describe("moving locations", () => {
  const tree = buildLocationTree<FlatLocation>([
    { id: "p1", name: "Norte", code: "N", type: "PLANT", parentId: null, path: "/N" },
    { id: "p2", name: "Sur", code: "S", type: "PLANT", parentId: null, path: "/S" },
    { id: "a1", name: "Calderas", code: "N-CAL", type: "AREA", parentId: "p1", path: "/N/N-CAL" },
    { id: "a2", name: "Turbinas", code: "N-TUR", type: "AREA", parentId: "p1", path: "/N/N-TUR" },
    { id: "a3", name: "Reactores", code: "S-REA", type: "AREA", parentId: "p2", path: "/S/S-REA" },
    {
      id: "u1",
      name: "Caldera 1",
      code: "N-CAL-U1",
      type: "UNIT",
      parentId: "a1",
      path: "/N/N-CAL/N-CAL-U1",
    },
  ]);

  it("knows the parent level of each type", () => {
    expect(parentLocationType("PLANT")).toBeNull();
    expect(parentLocationType("AREA")).toBe("PLANT");
    expect(parentLocationType("SITE")).toBe("UNIT");
  });

  it("offers every location of the parent level except the current parent, with its route", () => {
    const unit = {
      id: "u1",
      name: "Caldera 1",
      code: "N-CAL-U1",
      type: "UNIT",
      parentId: "a1",
      path: "/N/N-CAL/N-CAL-U1",
    } as const;

    expect(listMoveTargets(tree, unit)).toEqual([
      { id: "a2", label: "Norte › Turbinas" },
      { id: "a3", label: "Sur › Reactores" },
    ]);
  });

  it("moves areas between plants and never offers anything for a plant", () => {
    const area = {
      id: "a1",
      name: "Calderas",
      code: "N-CAL",
      type: "AREA",
      parentId: "p1",
      path: "/N/N-CAL",
    } as const;
    const plant = {
      id: "p1",
      name: "Norte",
      code: "N",
      type: "PLANT",
      parentId: null,
      path: "/N",
    } as const;

    expect(listMoveTargets(tree, area).map((target) => target.id)).toEqual(["p2"]);
    expect(listMoveTargets(tree, plant)).toEqual([]);
  });

  it("requires a destination", () => {
    expect(moveLocationSchema.safeParse({ id: "u1", parentId: "" }).success).toBe(false);
    expect(moveLocationSchema.safeParse({ id: "u1", parentId: "a2" }).success).toBe(true);
  });
});
