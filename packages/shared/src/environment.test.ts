import { describe, expect, it } from "vitest";
import { parseEnvironment } from "./environment";

describe("parseEnvironment", () => {
  it("applies safe development defaults", () => {
    expect(parseEnvironment({})).toEqual({
      NODE_ENV: "development",
      APP_URL: "http://localhost:3000",
      SMTP_HOST: "localhost",
      SMTP_PORT: 1025,
      EMAIL_FROM: "no-reply@cables.local",
    });
  });

  it("coerces and validates SMTP_PORT", () => {
    expect(parseEnvironment({ SMTP_PORT: "2525" }).SMTP_PORT).toBe(2525);
    expect(() => parseEnvironment({ SMTP_PORT: "70000" })).toThrow();
  });

  it("rejects malformed application URLs", () => {
    expect(() => parseEnvironment({ APP_URL: "not-a-url" })).toThrow();
  });
});
