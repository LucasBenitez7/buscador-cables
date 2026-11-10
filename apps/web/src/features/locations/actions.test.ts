// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createLocation: vi.fn(),
  updateLocation: vi.fn(),
  deleteLocation: vi.fn(),
  moveLocation: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/session", () => ({ authorize: mocks.authorize }));
vi.mock("@/server/locations/service", async () => {
  class LocationServiceError extends Error {}
  return {
    LocationServiceError,
    createLocation: mocks.createLocation,
    updateLocation: mocks.updateLocation,
    deleteLocation: mocks.deleteLocation,
    moveLocation: mocks.moveLocation,
  };
});

const { createLocationAction, deleteLocationAction, moveLocationAction, updateLocationAction } =
  await import("./actions");
const { LocationServiceError } = await import("@/server/locations/service");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

const allowed = { ok: true, user: { id: "u1", name: "Sara", email: "s@x", role: "SUPERVISOR" } };

describe("location actions", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.authorize.mockResolvedValue(allowed);
  });

  it("checks the location:manage permission before anything else", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, message: "No tienes permiso." });

    const result = await createLocationAction(null, form({ name: "P", code: "P", type: "PLANT" }));

    expect(mocks.authorize).toHaveBeenCalledWith("location:manage");
    expect(result).toEqual({ ok: false, message: "No tienes permiso." });
    expect(mocks.createLocation).not.toHaveBeenCalled();
  });

  it("validates and normalizes the input with Zod", async () => {
    mocks.createLocation.mockResolvedValue({ name: "Reactor X" });

    const result = await createLocationAction(
      null,
      form({ name: " Reactor X ", code: "r-x", type: "UNIT", parentId: "a1" }),
    );

    expect(mocks.createLocation).toHaveBeenCalledWith({
      name: "Reactor X",
      code: "R-X",
      type: "UNIT",
      parentId: "a1",
    });
    expect(result.ok).toBe(true);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/locations");
  });

  it("treats an empty parent as a root location", async () => {
    mocks.createLocation.mockResolvedValue({ name: "Planta" });

    await createLocationAction(
      null,
      form({ name: "Planta", code: "PL", type: "PLANT", parentId: "" }),
    );

    expect(mocks.createLocation).toHaveBeenCalledWith(expect.objectContaining({ parentId: null }));
  });

  it("returns the validation message without calling the service", async () => {
    const result = await updateLocationAction(null, form({ id: "l1", name: "X", code: "A/B" }));

    expect(result.ok).toBe(false);
    expect(mocks.updateLocation).not.toHaveBeenCalled();
  });

  it("shows business errors and hides unexpected ones", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.deleteLocation.mockRejectedValueOnce(new LocationServiceError("Primero elimina…"));
    mocks.deleteLocation.mockRejectedValueOnce(new Error("connection reset"));

    expect(await deleteLocationAction(form({ id: "l1" }))).toEqual({
      ok: false,
      message: "Primero elimina…",
    });
    expect((await deleteLocationAction(form({ id: "l1" }))).message).toMatch(/No se pudo/);
  });

  it("moves a location only with permission and a destination", async () => {
    expect(await moveLocationAction(form({ id: "u1", parentId: "" }))).toEqual({
      ok: false,
      message: "Elige el nuevo destino",
    });
    expect(mocks.moveLocation).not.toHaveBeenCalled();

    await moveLocationAction(form({ id: "u1", parentId: "a2" }));

    expect(mocks.authorize).toHaveBeenCalledWith("location:manage");
    expect(mocks.moveLocation).toHaveBeenCalledWith({ id: "u1", parentId: "a2" });
  });
});
