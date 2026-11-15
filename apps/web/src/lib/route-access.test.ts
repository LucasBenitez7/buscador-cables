import { describe, expect, it } from "vitest";
import { isPublicPath, safeNextPath } from "./route-access";

describe("isPublicPath", () => {
  it.each([
    "/login",
    "/register",
    "/verify-email",
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

  it("keeps the query and the hash of internal paths", () => {
    expect(safeNextPath("/cables?q=xab&page=2#top")).toBe("/cables?q=xab&page=2#top");
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

  // Regresión: los navegadores quitan tabuladores y saltos de línea de las URL, así que
  // "/\t/evil.example" acababa en "//evil.example", otro sitio, tras iniciar sesión.
  it.each(["/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/\t\\evil.example"])(
    "falls back to / for %j (control characters)",
    (value) => {
      expect(safeNextPath(value)).toBe("/");
    },
  );

  it("never returns a path that a browser resolves to another origin", () => {
    for (const value of ["/\t/evil.example", "/ /evil.example", "/./evil.example", "/a/../b"]) {
      const next = safeNextPath(value);
      expect(new URL(next, "http://app.example").origin).toBe("http://app.example");
    }
  });
});
