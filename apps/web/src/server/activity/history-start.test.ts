import { HISTORY_START } from "@cables/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { historyStart, visibleLastAction } from "./history-start";

const SAVED = process.env.HISTORY_START;

beforeEach(() => {
  delete process.env.HISTORY_START;
});

afterEach(() => {
  if (SAVED === undefined) delete process.env.HISTORY_START;
  else process.env.HISTORY_START = SAVED;
});

describe("historyStart", () => {
  it("is 17/11/2026 00:00 in Madrid when nothing overrides it", () => {
    expect(historyStart().toISOString()).toBe("2026-11-16T23:00:00.000Z");
    expect(historyStart()).toEqual(HISTORY_START);
  });

  it("reads HISTORY_START from the environment", () => {
    process.env.HISTORY_START = "2026-12-01T00:00:00Z";

    expect(historyStart().toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });

  it("falls back to the default when the value is not a date", () => {
    process.env.HISTORY_START = "ayer";

    expect(historyStart()).toEqual(HISTORY_START);
  });

  it("falls back to the default when the value is empty", () => {
    process.env.HISTORY_START = "";

    expect(historyStart()).toEqual(HISTORY_START);
  });
});

describe("visibleLastAction", () => {
  const value = { action: "CONNECTED" };

  it("shows a last action from the history start on", () => {
    expect(visibleLastAction(new Date("2026-11-17T09:00:00Z"), value)).toBe(value);
    expect(visibleLastAction(HISTORY_START, value)).toBe(value);
  });

  it("hides a last action from before the history start", () => {
    expect(visibleLastAction(new Date("2026-11-16T22:59:59Z"), value)).toBeNull();
  });

  it("gives null when there is no last action", () => {
    expect(visibleLastAction(null, value)).toBeNull();
  });
});
