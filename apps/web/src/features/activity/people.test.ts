import { describe, expect, it } from "vitest";
import { activityPeople } from "./people";

describe("activityPeople", () => {
  it("puts the current person first, as «Yo», and the rest as they come", () => {
    const users = [
      { id: "u1", label: "Ana" },
      { id: "u2", label: "Juan" },
      { id: "u3", label: "Marta" },
    ];

    expect(activityPeople(users, { id: "u2", name: "Juan" })).toEqual([
      { id: "u2", label: "Yo (Juan)" },
      { id: "u1", label: "Ana" },
      { id: "u3", label: "Marta" },
    ]);
  });

  it("offers «Yo» even before the person has registered anything", () => {
    expect(activityPeople([{ id: "u1", label: "Ana" }], { id: "u9", name: "Luis" })).toEqual([
      { id: "u9", label: "Yo (Luis)" },
      { id: "u1", label: "Ana" },
    ]);
  });
});
