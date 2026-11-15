import { describe, expect, it } from "vitest";
import { parseEnvironment } from "@cables/shared";

// `env.ts` resolves `process.env` at import time, so the contract is exercised
// here with explicit inputs instead of mutating the real environment.
describe("environment contract used by lib/env", () => {
  it("applies development defaults", () => {
    expect(parseEnvironment({})).toEqual({
      NODE_ENV: "development",
      APP_URL: "http://localhost:3000",
      SMTP_HOST: "localhost",
      SMTP_PORT: 1025,
      EMAIL_FROM: "no-reply@cables.local",
      DRAWINGS_DIR: "private-data/drawings",
      AUTH_IP_HEADERS: ["x-forwarded-for"],
    });
  });

  // Fase 10: la IP del límite de intentos sale solo de la cabecera que pone el proxy.
  it("reads the trusted IP headers as a list and an empty cron secret as none", () => {
    const parsed = parseEnvironment({ AUTH_IP_HEADERS: " X-Real-IP, ", CRON_SECRET: "" });

    expect(parsed.AUTH_IP_HEADERS).toEqual(["x-real-ip"]);
    expect(parsed.CRON_SECRET).toBeUndefined();
    expect(() => parseEnvironment({ CRON_SECRET: "corto" })).toThrow();
  });

  it("keeps DATABASE_URL undefined when absent so lib/env can reject it", () => {
    expect(parseEnvironment({}).DATABASE_URL).toBeUndefined();
  });

  it("accepts the local Docker connection strings", () => {
    const parsed = parseEnvironment({
      DATABASE_URL: "postgresql://cables:cables@localhost:5433/cables?schema=public",
      DATABASE_URL_TEST: "postgresql://cables:cables@localhost:5433/cables_test?schema=public",
    });

    expect(parsed.DATABASE_URL).toContain("localhost:5433/cables");
    expect(parsed.DATABASE_URL_TEST).toContain("cables_test");
  });

  it("rejects a malformed APP_URL", () => {
    expect(() => parseEnvironment({ APP_URL: "not-a-url" })).toThrow();
  });

  it("rejects an out-of-range SMTP_PORT", () => {
    expect(() => parseEnvironment({ SMTP_PORT: "70000" })).toThrow();
  });
});
