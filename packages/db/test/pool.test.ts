import { describe, expect, it } from "vitest";
import { DEFAULT_POOL_MAX, poolMax } from "../src/client";

// Revisión F7.5, M3: cada instancia abría el grupo de conexiones por defecto, sin límite propio.
describe("poolMax", () => {
  it("uses a small default and the configured size", () => {
    expect(poolMax(undefined)).toBe(DEFAULT_POOL_MAX);
    expect(poolMax(" ")).toBe(DEFAULT_POOL_MAX);
    expect(poolMax("2")).toBe(2);
  });

  it("refuses a size that is not a whole number from 1 to 100", () => {
    for (const raw of ["0", "-1", "2.5", "101", "muchas"]) {
      expect(() => poolMax(raw)).toThrow(/DATABASE_POOL_MAX/);
    }
  });
});
