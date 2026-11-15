import { describe, expect, it } from "vitest";
import { authRateLimit } from "./auth-rate-limit";

describe("authRateLimit", () => {
  it("is always on and shared across instances through the database", () => {
    expect(authRateLimit.enabled).toBe(true);
    expect(authRateLimit.storage).toBe("database");
  });

  it.each([
    // Generoso a propósito: toda la planta comparte IP. El límite por cuenta va aparte.
    ["/sign-in/email", 30],
    ["/sign-up/email", 3],
    ["/request-password-reset", 3],
    ["/reset-password", 5],
  ] as const)("limits %s to %i requests per minute", (path, max) => {
    expect(authRateLimit.customRules[path]).toEqual({ window: 60, max });
  });
});
