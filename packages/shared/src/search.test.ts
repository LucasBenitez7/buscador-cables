import { describe, expect, it } from "vitest";
import {
  cableSearchQuery,
  effectiveSort,
  hasActiveFilters,
  hasActivityFilters,
  parseCableSearch,
} from "./search";

describe("project data filters", () => {
  it("reads the level, the tray (normalized) and the loose-end flag", () => {
    expect(parseCableSearch({ level: "L2", tray: " 99uxa00l22036 ", loose: "1" })).toMatchObject({
      level: "L2",
      tray: "99UXA00L22036",
      loose: "1",
    });
  });

  it("ignores values that are not valid", () => {
    expect(parseCableSearch({ level: "L9", tray: "x".repeat(60), loose: "yes" })).toEqual({});
  });
});

describe("parseCableSearch", () => {
  it("reads filters from the URL, accepting a decimal comma", () => {
    expect(
      parseCableSearch({
        q: " sh50 ",
        installation: "LAID",
        sectionMin: "2,5",
        lengthMax: "100",
        page: "3",
      }),
    ).toEqual({ q: "sh50", installation: "LAID", sectionMin: 2.5, lengthMax: 100, page: 3 });
  });

  it("ignores invalid or empty values instead of failing", () => {
    expect(
      parseCableSearch({
        q: "",
        installation: "FLYING",
        sectionMin: "mucho",
        page: "-2",
        sort: "price",
        lengthMin: "-5",
      }),
    ).toEqual({});
  });

  it("keeps the first value of repeated keys", () => {
    expect(parseCableSearch({ type: ["a", "b"] })).toEqual({ type: "a" });
  });

  it("reads the who / what / when filters and ignores bad dates", () => {
    expect(
      parseCableSearch({ actor: "u1", action: "CONNECTED", from: "2026-11-01", to: "2026-11-31" }),
    ).toEqual({ actor: "u1", action: "CONNECTED", from: "2026-11-01" });
    expect(parseCableSearch({ action: "HACK", from: "ayer" })).toEqual({});
    expect(hasActivityFilters(parseCableSearch({ action: "MOVED" }))).toBe(true);
    expect(hasActivityFilters(parseCableSearch({ q: "sh50" }))).toBe(false);
  });
});

describe("effectiveSort", () => {
  it("sorts by relevance when searching by text, by code otherwise", () => {
    expect(effectiveSort({ q: "sh50" })).toEqual({ sort: "relevance", dir: "asc" });
    expect(effectiveSort({})).toEqual({ sort: "code", dir: "asc" });
    expect(effectiveSort({ sort: "relevance" })).toEqual({ sort: "code", dir: "asc" });
  });

  it("shows the latest changes first by default", () => {
    expect(effectiveSort({ sort: "updated" })).toEqual({ sort: "updated", dir: "desc" });
    expect(effectiveSort({ sort: "length", dir: "desc" })).toEqual({ sort: "length", dir: "desc" });
  });
});

describe("cableSearchQuery", () => {
  it("builds a shareable query string without empty values or page 1", () => {
    expect(cableSearchQuery({ q: "sh50", type: "t1", page: 1 })).toBe("?q=sh50&type=t1");
    expect(cableSearchQuery({})).toBe("");
  });

  it("applies overrides, e.g. for pagination links", () => {
    expect(cableSearchQuery({ q: "sh", page: 2 }, { page: 3 })).toBe("?q=sh&page=3");
    expect(cableSearchQuery({ q: "sh", page: 4 }, { sort: "length", page: undefined })).toBe(
      "?q=sh&sort=length",
    );
  });

  it("keeps a page size other than the default and drops the default one", () => {
    expect(cableSearchQuery({ q: "sh", size: 100 }, { page: 2 })).toBe("?q=sh&page=2&size=100");
    expect(cableSearchQuery({ q: "sh", size: 25 })).toBe("?q=sh");
    expect(parseCableSearch({ size: "50" }).size).toBe(50);
    expect(parseCableSearch({ size: "5000" }).size).toBeUndefined();
  });

  it("round-trips through the parser", () => {
    const search = parseCableSearch({ q: "SH 5", color: "c1", sectionMax: "16", dir: "desc" });

    expect(
      parseCableSearch(Object.fromEntries(new URLSearchParams(cableSearchQuery(search)))),
    ).toEqual(search);
  });
});

describe("hasActiveFilters", () => {
  it("ignores paging and sorting", () => {
    expect(hasActiveFilters({ page: 2, sort: "code", size: 100 })).toBe(false);
    expect(hasActiveFilters({ location: "l1" })).toBe(true);
  });
});
