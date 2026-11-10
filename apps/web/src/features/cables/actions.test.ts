// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createCable: vi.fn(),
  updateCable: vi.fn(),
  deleteCable: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/session", () => ({ authorize: mocks.authorize }));
vi.mock("@/server/cables/service", () => ({
  CableServiceError: class CableServiceError extends Error {},
  createCable: mocks.createCable,
  updateCable: mocks.updateCable,
  deleteCable: mocks.deleteCable,
}));

const { createCableAction, deleteCableAction, updateCableAction } = await import("./actions");
const { CableServiceError } = await import("@/server/cables/service");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
}

const technician = {
  ok: true,
  user: { id: "u1", name: "Tomás", email: "t@x", role: "TECHNICIAN" },
};
const newCable = {
  code: "sh50",
  installationStatus: "IN_STOCK",
  connectionStatus: "DISCONNECTED",
  currentLocationId: "store",
  lengthM: "120,5",
};

describe("cable actions", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.authorize.mockResolvedValue(technician);
  });

  it("checks the right permission for each action", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, message: "No tienes permiso." });

    await createCableAction(form(newCable));
    await updateCableAction(form({ id: "c1", version: "1", code: "SH-50" }));
    await deleteCableAction(form({ id: "c1", version: "1", reason: "Duplicado" }));

    expect(mocks.authorize.mock.calls.map(([permission]) => permission)).toEqual([
      "cable:create",
      "cable:update",
      "cable:delete",
    ]);
    expect(mocks.createCable).not.toHaveBeenCalled();
    expect(mocks.updateCable).not.toHaveBeenCalled();
    expect(mocks.deleteCable).not.toHaveBeenCalled();
  });

  it("creates with normalized values and returns the new id", async () => {
    mocks.createCable.mockResolvedValue({ id: "c9", code: "SH-50" });

    const result = await createCableAction(form(newCable));

    expect(result).toEqual({ ok: true, message: "Cable SH-50 dado de alta.", id: "c9" });
    expect(mocks.createCable).toHaveBeenCalledWith(
      technician.user,
      expect.objectContaining({ code: "SH-50", lengthM: 120.5, originId: null }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/cables");
  });

  it("returns an error per field without calling the service", async () => {
    const result = await createCableAction(
      form({ ...newCable, code: "SH#1", crossSectionMm2: "2,555" }),
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.fieldErrors).toEqual({
      code: expect.any(String),
      crossSectionMm2: expect.stringMatching(/2 decimales/),
    });
    expect(mocks.createCable).not.toHaveBeenCalled();
  });

  it("reports an unchanged edit and shows service errors", async () => {
    mocks.updateCable.mockResolvedValueOnce({ changed: false });
    mocks.updateCable.mockRejectedValueOnce(new CableServiceError("Otra persona ha modificado…"));

    expect(await updateCableAction(form({ id: "c1", version: "2", code: "SH-50" }))).toEqual({
      ok: true,
      message: "No había cambios que guardar.",
      id: "c1",
      changed: false,
    });
    expect(await updateCableAction(form({ id: "c1", version: "2", code: "SH-50" }))).toEqual({
      ok: false,
      message: "Otra persona ha modificado…",
    });
  });

  it("requires a reason to delete", async () => {
    const result = await deleteCableAction(form({ id: "c1", version: "1", reason: "" }));

    expect(result).toEqual({ ok: false, message: "Indica el motivo de la baja" });
    expect(mocks.deleteCable).not.toHaveBeenCalled();
  });
});
