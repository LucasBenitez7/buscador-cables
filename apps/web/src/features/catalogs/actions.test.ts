// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createCatalogItem: vi.fn(),
  updateCatalogItem: vi.fn(),
  deleteCatalogItem: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/session", () => ({ authorize: mocks.authorize }));
vi.mock("@/server/catalogs/service", () => ({
  CatalogServiceError: class CatalogServiceError extends Error {},
  createCatalogItem: mocks.createCatalogItem,
  updateCatalogItem: mocks.updateCatalogItem,
  deleteCatalogItem: mocks.deleteCatalogItem,
}));

const { createCatalogItemAction, deleteCatalogItemAction } = await import("./actions");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

describe("catalog actions", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.authorize.mockResolvedValue({ ok: true, user: { role: "SUPERVISOR" } });
  });

  it("requires catalog:manage", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, message: "No tienes permiso." });

    const result = await createCatalogItemAction(form({ kind: "color", name: "Rojo" }));

    expect(mocks.authorize).toHaveBeenCalledWith("catalog:manage");
    expect(result.ok).toBe(false);
    expect(mocks.createCatalogItem).not.toHaveBeenCalled();
  });

  it("passes normalized data to the service", async () => {
    mocks.createCatalogItem.mockResolvedValue({ name: "Rojo" });

    await createCatalogItemAction(form({ kind: "color", name: "  Rojo ", hex: "#c0392b" }));

    expect(mocks.createCatalogItem).toHaveBeenCalledWith({
      kind: "color",
      name: "Rojo",
      hex: "#C0392B",
    });
  });

  it("rejects an invalid catalog kind", async () => {
    const result = await deleteCatalogItemAction(form({ kind: "users", id: "u1" }));

    expect(result).toEqual({ ok: false, message: "Datos no válidos." });
    expect(mocks.deleteCatalogItem).not.toHaveBeenCalled();
  });
});
