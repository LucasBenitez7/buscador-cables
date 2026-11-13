// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

// Revisión F0-F7 (C7): la app no enviaba ninguna cabecera de seguridad.
describe("security headers", () => {
  it("applies to every route", async () => {
    const rules = await nextConfig.headers?.();

    expect(rules).toHaveLength(1);
    expect(rules?.[0]?.source).toBe("/:path*");
  });

  it("forbids framing, content sniffing and leaking URLs to other sites", async () => {
    const [rule] = (await nextConfig.headers?.()) ?? [];
    const headers = Object.fromEntries(rule?.headers.map(({ key, value }) => [key, value]) ?? []);

    expect(headers).toEqual({
      "Content-Security-Policy": "frame-ancestors 'none'",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
  });

  it("does not announce the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
