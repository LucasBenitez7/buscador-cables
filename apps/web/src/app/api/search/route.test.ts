// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), quickSearch: vi.fn() }));
vi.mock("@/server/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/search/quick", () => ({ QUICK_SEARCH_MAX: 80, quickSearch: mocks.quickSearch }));

const { GET } = await import("./route");

const call = (query: string) => GET(new NextRequest(`http://localhost/api/search?${query}`));

describe("GET /api/search", () => {
  beforeEach(() => {
    mocks.getCurrentUser.mockReset();
    mocks.quickSearch.mockReset().mockResolvedValue({ cables: [] });
  });

  it("answers only signed-in users", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const response = await call("q=sh");

    expect(response.status).toBe(401);
    expect(mocks.quickSearch).not.toHaveBeenCalled();
  });

  it("searches the text, cut to its maximum, and is never cached", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "u1" });

    const response = await call(`q=${"a".repeat(200)}`);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.quickSearch).toHaveBeenCalledWith("a".repeat(80));
    expect(await call("")).toHaveProperty("status", 200);
    expect(mocks.quickSearch).toHaveBeenLastCalledWith("");
  });
});
