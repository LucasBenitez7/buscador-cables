import { describe, expect, it } from "vitest";
import {
  listQuery,
  optionsOf,
  parseCableHistorySearch,
  parseEquipmentSearch,
  parseUserEventSearch,
  parseUserListSearch,
} from "./list-filters";

describe("list filters", () => {
  it("reads valid filters and ignores invalid ones instead of failing", () => {
    expect(
      parseUserListSearch({
        q: "  ana ",
        role: "TECHNICIAN",
        status: "pending",
        sort: "name",
        page: "2",
      }),
    ).toEqual({ q: "ana", role: "TECHNICIAN", status: "pending", sort: "name", page: 2 });
    expect(parseUserListSearch({ role: "ROOT", status: "x", sort: "y", page: "-1" })).toEqual({});
  });

  it("reads the account changes filters, with real dates only", () => {
    expect(
      parseUserEventSearch({
        action: "ROLE_CHANGED",
        from: "2026-11-01",
        to: "2026-11-31",
        sort: "oldest",
      }),
    ).toEqual({ action: "ROLE_CHANGED", from: "2026-11-01", sort: "oldest" });
  });

  it("reads the history and equipment filters, and caps free text", () => {
    expect(parseCableHistorySearch({ action: "WIRING_EDITED", person: "u1", sort: "x" })).toEqual({
      action: "WIRING_EDITED",
      person: "u1",
    });
    expect(
      parseEquipmentSearch({ state: "pending", test: "ok", block: "X51", sort: "code" }),
    ).toEqual({
      state: "pending",
      test: "ok",
      block: "X51",
      sort: "code",
    });
    expect(parseEquipmentSearch({ q: "x".repeat(200) }).q).toBeUndefined();
  });

  it("builds clean query strings, without empty values or defaults", () => {
    expect(
      listQuery(
        { q: "ana", role: undefined, page: 1, sort: "priority" },
        { page: 1, sort: "priority" },
      ),
    ).toBe("?q=ana");
    expect(listQuery({ page: 3 }, { page: 1 })).toBe("?page=3");
    expect(listQuery({})).toBe("");
  });

  it("turns label records into select options", () => {
    expect(optionsOf({ a: "Uno", b: "Dos" })).toEqual([
      { value: "a", label: "Uno" },
      { value: "b", label: "Dos" },
    ]);
  });
});
