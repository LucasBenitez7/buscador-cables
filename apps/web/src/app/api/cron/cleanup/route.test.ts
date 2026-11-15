// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const { cleanupExpired } = vi.hoisted(() => ({ cleanupExpired: vi.fn() }));
vi.mock("@/server/maintenance", () => ({ cleanupExpired }));
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET: "s".repeat(40) } }));

const { GET } = await import("./route");

const call = (authorization?: string) =>
  GET(
    new Request("http://localhost/api/cron/cleanup", {
      headers: authorization ? { authorization } : {},
    }),
  );

describe("GET /api/cron/cleanup", () => {
  it("only runs for Vercel Cron, with the secret", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    cleanupExpired.mockResolvedValue({ verifications: 1, sessions: 2, rateLimits: 3 });

    expect((await call()).status).toBe(401);
    expect((await call("Bearer otro")).status).toBe(401);
    expect(cleanupExpired).not.toHaveBeenCalled();

    const response = await call(`Bearer ${"s".repeat(40)}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ verifications: 1, sessions: 2, rateLimits: 3 });
  });
});
