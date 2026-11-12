import { describe, expect, it } from "vitest";
import {
  cableSearchQuery,
  effectiveSort,
  hasActiveFilters,
  hasActivityFilters,
  parseCableSearch,
} from "./search";

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

  it("round-trips through the parser", () => {
    const search = parseCableSearch({ q: "SH 5", color: "c1", sectionMax: "16", dir: "desc" });

    expect(
      parseCableSearch(Object.fromEntries(new URLSearchParams(cableSearchQuery(search)))),
    ).toEqual(search);
  });
});

describe("hasActiveFilters", () => {
  it("ignores paging and sorting", () => {
    expect(hasActiveFilters({ page: 2, sort: "code" })).toBe(false);
    expect(hasActiveFilters({ location: "l1" })).toBe(true);
  });
});
