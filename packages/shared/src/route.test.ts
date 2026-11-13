import { describe, expect, it } from "vitest";
import { routeProgress } from "./route";

const route = [
  { trayCode: "99UXA00L22036" },
  { trayCode: null },
  { trayCode: "99UXA00L22051" },
  { trayCode: "99UZA00L22001" },
];

const state = (overrides: Partial<Parameters<typeof routeProgress>[1]> = {}) => ({
  installationStatus: "PARTIALLY_LAID" as const,
  looseEnd: "DESTINATION" as const,
  looseEndTray: "99UXA00L22051",
  ...overrides,
});

describe("routeProgress", () => {
  it("marks the route laid from the origin up to the tray where the destination end waits", () => {
    expect(routeProgress(route, state())).toEqual({
      steps: ["laid", "laid", "laid", "pending"],
      looseIndex: 2,
    });
  });

  it("marks it laid from the destination back to the tray when the origin end is loose", () => {
    expect(routeProgress(route, state({ looseEnd: "ORIGIN" }))).toEqual({
      steps: ["pending", "pending", "laid", "laid"],
      looseIndex: 2,
    });
  });

  it("marks every step laid on a laid cable", () => {
    expect(routeProgress(route, state({ installationStatus: "LAID", looseEnd: null }))).toEqual({
      steps: ["laid", "laid", "laid", "laid"],
      looseIndex: null,
    });
  });

  it("does not guess when the tray is not on the route or nothing was recorded", () => {
    const unknown = { steps: ["unknown", "unknown", "unknown", "unknown"], looseIndex: null };
    expect(routeProgress(route, state({ looseEndTray: "99UYC01L10002" }))).toEqual(unknown);
    expect(
      routeProgress(route, state({ installationStatus: "UNVERIFIED", looseEnd: null })),
    ).toEqual(unknown);
  });
});
