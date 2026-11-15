// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { logError, logInfo } from "./log";

afterEach(() => vi.restoreAllMocks());

describe("server logs", () => {
  it("writes one JSON line with the level, the scope and the error", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    logError("drawings", "No se pudo leer", new Error("timeout"), { path: "/api/drawings/x" });

    const entry = JSON.parse(error.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(entry).toMatchObject({
      level: "error",
      scope: "drawings",
      message: "No se pudo leer",
      error: "timeout",
      path: "/api/drawings/x",
    });
    expect(entry.time).toEqual(expect.any(String));
  });

  it("logs information on the info level", () => {
    const info = vi.spyOn(console, "log").mockImplementation(() => {});

    logInfo("cron", "Limpieza hecha", { sessions: 2 });

    expect(JSON.parse(info.mock.calls[0]![0] as string)).toMatchObject({
      level: "info",
      sessions: 2,
    });
  });
});
