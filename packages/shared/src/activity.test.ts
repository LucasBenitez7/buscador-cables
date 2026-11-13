import { describe, expect, it } from "vitest";
import { activityQuery, parseActivitySearch } from "./activity";
import { hasPermission } from "./permissions";

describe("parseActivitySearch", () => {
  it("reads valid filters and ignores the rest", () => {
    expect(
      parseActivitySearch({
        actor: "u1",
        action: "MOVED",
        from: "2026-11-01",
        to: "2026-02-30",
        page: "2",
        extra: "x",
      }),
    ).toEqual({ actor: "u1", action: "MOVED", from: "2026-11-01", page: 2 });
    expect(parseActivitySearch({ action: "HACK", page: "0", actor: ["a", "b"] })).toEqual({
      actor: "a",
    });
  });
});

describe("activityQuery", () => {
  it("builds clean links and drops page 1", () => {
    expect(activityQuery({ action: "LAID", page: 3 }, { page: 1 })).toBe("?action=LAID");
    expect(activityQuery({}, {})).toBe("");
    expect(activityQuery({ from: "2026-11-01" }, { page: 2 })).toBe("?from=2026-11-01&page=2");
    expect(activityQuery({ size: 200 }, { page: 2 })).toBe("?page=2&size=200");
    expect(activityQuery({ size: 50 })).toBe("");
    expect(parseActivitySearch({ size: "100" }).size).toBe(100);
    expect(parseActivitySearch({ size: "99999" }).size).toBeUndefined();
  });
});

describe("activity:view permission", () => {
  it("lets supervisors and admins see everyone's activity, not technicians or viewers", () => {
    expect(hasPermission("ADMIN", "activity:view")).toBe(true);
    expect(hasPermission("SUPERVISOR", "activity:view")).toBe(true);
    expect(hasPermission("TECHNICIAN", "activity:view")).toBe(false);
    expect(hasPermission("VIEWER", "activity:view")).toBe(false);
  });
});
