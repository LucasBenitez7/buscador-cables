import { describe, expect, it } from "vitest";
import {
  deviationLevel,
  distanceText,
  lengthDeviation,
  parseMetersSearch,
  percentText,
  signedMetresText,
} from "./meters";

describe("lengthDeviation", () => {
  it("says how many metres and what percent the real length is off the list", () => {
    expect(lengthDeviation(100, 112)).toEqual({ metres: 12, percent: 12 });
    expect(lengthDeviation(200, 150)).toEqual({ metres: -50, percent: -25 });
  });

  it("has nothing to say without both lengths or with a planned length of zero", () => {
    expect(lengthDeviation(null, 10)).toBeNull();
    expect(lengthDeviation(10, null)).toBeNull();
    expect(lengthDeviation(0, 10)).toBeNull();
  });
});

describe("deviationLevel", () => {
  it("is ok up to 10 %, a warning up to 25 % and to review above, either way", () => {
    expect(deviationLevel(10)).toBe("ok");
    expect(deviationLevel(-10)).toBe("ok");
    expect(deviationLevel(10.5)).toBe("warning");
    expect(deviationLevel(-25)).toBe("warning");
    expect(deviationLevel(25.1)).toBe("review");
    expect(deviationLevel(-76)).toBe("review");
  });
});

describe("texts", () => {
  it("writes percents and metres with their sign", () => {
    expect(percentText(4.6)).toBe("+5 %");
    expect(percentText(-12.2)).toBe("−12 %");
    expect(percentText(0.3)).toBe("0 %");
    expect(signedMetresText(1234.4)).toBe("+1.234 m");
    expect(signedMetresText(-8)).toBe("−8 m");
  });

  it("writes long totals in kilometres and short ones in metres", () => {
    expect(distanceText(403_912)).toBe("403,9 km");
    expect(distanceText(1000)).toBe("1 km");
    expect(distanceText(850)).toBe("850 m");
  });
});

describe("parseMetersSearch", () => {
  it("reads the tab and the search, and falls back to «Avance» on anything else", () => {
    expect(parseMetersSearch({ tab: "bobinas", q: " B-1 " })).toEqual({ tab: "bobinas", q: "B-1" });
    expect(parseMetersSearch({ tab: "otra" })).toEqual({ tab: "avance" });
    expect(parseMetersSearch({ tab: ["desviacion", "bobinas"], q: "" })).toEqual({
      tab: "desviacion",
    });
    expect(parseMetersSearch({ q: "x".repeat(101) }).q).toBeUndefined();
  });
});
