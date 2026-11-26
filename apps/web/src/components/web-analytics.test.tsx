import { describe, expect, it } from "vitest";
import { withoutQuery } from "./web-analytics";

describe("withoutQuery", () => {
  it("sends the page without its query nor its hash", () => {
    expect(
      withoutQuery({
        type: "pageview",
        url: "https://cables.example.test/reset-password?token=abc#top",
      }),
    ).toEqual({ type: "pageview", url: "https://cables.example.test/reset-password" });
    expect(
      withoutQuery({ type: "event", url: "https://cables.example.test/cables?q=zz-1&page=2" }),
    ).toEqual({ type: "event", url: "https://cables.example.test/cables" });
  });

  it("leaves a page without query as it is", () => {
    expect(withoutQuery({ type: "pageview", url: "https://cables.example.test/meters" })).toEqual({
      type: "pageview",
      url: "https://cables.example.test/meters",
    });
  });
});
