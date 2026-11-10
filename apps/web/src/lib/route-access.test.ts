import { describe, expect, it } from "vitest";
import { isPublicPath, safeNextPath } from "./route-access";

describe("isPublicPath", () => {
  it.each([
    "/login",
    "/forgot-password",
    "/reset-password",
    "/api/auth/sign-in/email",
    "/api/health",
  ])("treats %s as public", (path) => {
    expect(isPublicPath(path)).toBe(true);
  });

  it.each(["/", "/admin/users", "/loginx", "/api/cables"])("treats %s as protected", (path) => {
    expect(isPublicPath(path)).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps internal paths", () => {
    expect(safeNextPath("/admin/users")).toBe("/admin/users");
  });

  it.each([
    null,
    undefined,
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "cables",
  ])("falls back to / for %j", (value) => {
    expect(safeNextPath(value)).toBe("/");
  });
});
