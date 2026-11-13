// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  createCable: vi.fn(),
  updateCable: vi.fn(),
  deleteCable: vi.fn(),
  runCableAction: vi.fn(),
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
vi.mock("@/server/cables/field-actions", () => ({ runCableAction: mocks.runCableAction }));

const { createCableAction, deleteCableAction, runCableActionAction, updateCableAction } =
  await import("./actions");
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

describe("runCableActionAction", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.authorize.mockResolvedValue(technician);
  });

  it("asks for the permission of each specific action", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, message: "No tienes permiso." });

    await runCableActionAction(form({ cableId: "c1", version: "1", action: "CONNECTED" }));
    await runCableActionAction(form({ cableId: "c1", version: "1", action: "RETIRED" }));
    await runCableActionAction(form({ cableId: "c1", version: "1", action: "CORRECTION" }));

    expect(mocks.authorize.mock.calls.map(([permission]) => permission)).toEqual([
      "cable:connect",
      "cable:retire",
      "cable:correct",
    ]);
    expect(mocks.runCableAction).not.toHaveBeenCalled();
  });

  it("rejects unknown and non-field actions before checking anything", async () => {
    for (const action of ["DELETED", "CREATED", "HACK", ""]) {
      expect(await runCableActionAction(form({ cableId: "c1", version: "1", action }))).toEqual({
        ok: false,
        message: "Acción no válida.",
      });
    }
    expect(mocks.authorize).not.toHaveBeenCalled();
  });

  it("runs a valid action and refreshes the list and the record", async () => {
    mocks.runCableAction.mockResolvedValue({ cableId: "c1", message: "Movimiento registrado." });

    const result = await runCableActionAction(
      form({ cableId: "c1", version: "4", action: "CONNECTED", end: "ORIGIN", notes: "" }),
    );

    expect(result).toEqual({ ok: true, message: "Movimiento registrado.", id: "c1" });
    expect(mocks.runCableAction).toHaveBeenCalledWith(technician.user, {
      cableId: "c1",
      version: 4,
      action: "CONNECTED",
      end: "ORIGIN",
      notes: null,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/cables");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/cables/c1");
  });

  it("passes the loose end and the tray of a partial laying to the service", async () => {
    mocks.runCableAction.mockResolvedValue({ cableId: "c1", message: "Movimiento registrado." });

    await runCableActionAction(
      form({
        cableId: "c1",
        version: "2",
        action: "PARTIALLY_LAID",
        looseEnd: "DESTINATION",
        trayCode: "99uxa00l22036",
      }),
    );

    expect(mocks.runCableAction).toHaveBeenCalledWith(technician.user, {
      cableId: "c1",
      version: 2,
      action: "PARTIALLY_LAID",
      looseEnd: "DESTINATION",
      trayCode: "99UXA00L22036",
      notes: null,
    });
  });

  it("passes the loose end of a correction to the service", async () => {
    mocks.authorize.mockResolvedValue(technician);
    mocks.runCableAction.mockResolvedValue({ cableId: "c1", message: "Movimiento registrado." });

    await runCableActionAction(
      form({
        cableId: "c1",
        version: "2",
        action: "CORRECTION",
        correctsEventId: "e1",
        installationStatus: "PARTIALLY_LAID",
        connectionStatus: "DISCONNECTED",
        looseEnd: "ORIGIN",
        looseEndTray: "99UXA00L22036",
        notes: "La punta no llegó",
      }),
    );

    expect(mocks.runCableAction.mock.calls[0]?.[1]).toMatchObject({
      looseEnd: "ORIGIN",
      looseEndTray: "99UXA00L22036",
    });
  });

  it("requires a reason to retire and shows service errors", async () => {
    const withoutReason = await runCableActionAction(
      form({ cableId: "c1", version: "1", action: "RETIRED", notes: "" }),
    );
    expect(withoutReason).toMatchObject({ ok: false, fieldErrors: { notes: "Indica el motivo" } });
    expect(mocks.runCableAction).not.toHaveBeenCalled();

    mocks.runCableAction.mockRejectedValue(
      new CableServiceError("Solo se puede conectar un cable tendido."),
    );
    expect(
      await runCableActionAction(
        form({ cableId: "c1", version: "1", action: "CONNECTED", end: "BOTH" }),
      ),
    ).toEqual({ ok: false, message: "Solo se puede conectar un cable tendido." });
  });
});
