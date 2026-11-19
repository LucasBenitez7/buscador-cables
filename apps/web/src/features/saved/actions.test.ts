// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  createFolder: vi.fn(),
  saveItems: vi.fn(),
  moveItems: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/server/saved/service", () => ({
  SavedServiceError: class SavedServiceError extends Error {},
  createFolder: mocks.createFolder,
  renameFolder: vi.fn(),
  deleteFolder: vi.fn(),
  foldersFor: vi.fn(),
  saveItems: mocks.saveItems,
  moveItems: mocks.moveItems,
}));

const { createFolderAction, moveItemsAction, saveItemsAction } = await import("./actions");

const form = (name: string) => {
  const data = new FormData();
  data.set("name", name);
  return data;
};

describe("saved actions", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    // Cualquier rol guarda: lo suyo es solo suyo.
    mocks.getCurrentUser.mockResolvedValue({ id: "ana", role: "VIEWER" });
  });

  it("need a session, nothing more", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const result = await createFolderAction(null, form("Armario"));

    expect(result).toEqual({
      ok: false,
      message: "Tu sesión ha caducado. Vuelve a iniciar sesión.",
    });
    expect(mocks.createFolder).not.toHaveBeenCalled();
  });

  it("create the folder of the person signed in, with the name tidied up", async () => {
    mocks.createFolder.mockResolvedValue({ id: "f1" });

    const result = await createFolderAction(null, form("  Armario   99BMA "));

    expect(mocks.createFolder).toHaveBeenCalledWith("ana", "Armario 99BMA");
    expect(result).toEqual({ ok: true, message: "Carpeta «Armario 99BMA» creada." });
  });

  it("reject an empty name and saving without a folder", async () => {
    expect((await createFolderAction(null, form("   "))).ok).toBe(false);

    const result = await saveItemsAction({ refs: [{ kind: "CABLE", key: "c1" }] });

    expect(result).toEqual({ ok: false, message: "Elige una carpeta" });
    expect(mocks.saveItems).not.toHaveBeenCalled();
  });

  it("say what was saved and where", async () => {
    mocks.saveItems.mockResolvedValue({ saved: 3, folders: ["Armario 99BMA"] });

    const result = await saveItemsAction({
      refs: [1, 2, 3].map((n) => ({ kind: "CABLE", key: `c${n}` })),
      add: ["f1"],
    });

    expect(mocks.saveItems).toHaveBeenCalledWith("ana", expect.objectContaining({ add: ["f1"] }));
    expect(result).toEqual({ ok: true, message: "3 cables en «Armario 99BMA»." });
  });

  it("say what was moved or taken out", async () => {
    mocks.moveItems.mockResolvedValueOnce({ moved: 2, to: "B" });
    mocks.moveItems.mockResolvedValueOnce({ moved: 1, to: null });

    expect(
      await moveItemsAction({ folderId: "a", itemIds: ["i1", "i2"], toFolderId: "b" }),
    ).toEqual({ ok: true, message: "2 elementos movidos a «B»." });
    expect(await moveItemsAction({ folderId: "a", itemIds: ["i1"] })).toEqual({
      ok: true,
      message: "1 elemento quitado.",
    });
  });
});
