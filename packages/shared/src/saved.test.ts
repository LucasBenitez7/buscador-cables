import { describe, expect, it } from "vitest";
import { moveSavedItemsSchema, saveItemsSchema, savedFolderNameSchema } from "./saved";

describe("saved schemas", () => {
  it("tidies folder names and limits their length", () => {
    expect(savedFolderNameSchema.parse("  Armario   99BMA ")).toBe("Armario 99BMA");
    expect(savedFolderNameSchema.safeParse("   ").success).toBe(false);
    expect(savedFolderNameSchema.safeParse("x".repeat(61)).success).toBe(false);
  });

  it("needs something to save and a folder to put it in", () => {
    const refs = [{ kind: "TRAY", key: "99UXA00L22036" }];

    expect(saveItemsSchema.safeParse({ refs: [], add: ["f1"] }).success).toBe(false);
    expect(saveItemsSchema.safeParse({ refs }).success).toBe(false);
    expect(saveItemsSchema.parse({ refs, newFolder: " Nueva " })).toEqual({
      refs,
      add: [],
      remove: [],
      newFolder: "Nueva",
    });
    expect(
      saveItemsSchema.safeParse({ refs: [{ kind: "PLANT", key: "x" }], add: ["f1"] }).success,
    ).toBe(false);
  });

  it("moves at least one thing", () => {
    expect(moveSavedItemsSchema.safeParse({ folderId: "a", itemIds: [] }).success).toBe(false);
    expect(moveSavedItemsSchema.parse({ folderId: "a", itemIds: ["i1"] })).toEqual({
      folderId: "a",
      itemIds: ["i1"],
    });
  });
});
