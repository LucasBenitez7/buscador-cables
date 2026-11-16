// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  editWiring: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/session", () => ({ authorize: mocks.authorize }));
vi.mock("@/server/cables/service", () => ({
  CableServiceError: class CableServiceError extends Error {},
}));
vi.mock("@/server/cables/wiring", () => ({ editWiring: mocks.editWiring }));

const { editWiringAction } = await import("./wiring-actions");
const { CableServiceError } = await import("@/server/cables/service");

const technician = {
  ok: true,
  user: { id: "u1", name: "Tomás", email: "t@x", role: "TECHNICIAN" },
};
const input = {
  cableId: "c1",
  version: 1,
  wires: [
    {
      position: 1,
      originBlock: "X51",
      originPoint: "14",
      destinationBlock: null,
      destinationPoint: "+",
    },
  ],
};

describe("editWiringAction", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.authorize.mockResolvedValue(technician);
  });

  it("checks the wiring permission before anything else", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, message: "No tienes permiso." });

    expect(await editWiringAction(input)).toEqual({ ok: false, message: "No tienes permiso." });
    expect(mocks.authorize).toHaveBeenCalledWith("cable:wiring");
    expect(mocks.editWiring).not.toHaveBeenCalled();
  });

  it("rejects what does not fit the schema without calling the service", async () => {
    const result = await editWiringAction({
      ...input,
      wires: [{ ...input.wires[0], originPoint: "<x>" }],
    });

    expect(result).toMatchObject({ ok: false });
    expect(mocks.editWiring).not.toHaveBeenCalled();
    expect(await editWiringAction("basura")).toMatchObject({ ok: false });
  });

  it("saves and refreshes the cable page", async () => {
    mocks.editWiring.mockResolvedValue({ status: "saved", cableId: "c1", changedWires: 2 });

    expect(await editWiringAction(input)).toEqual({
      ok: true,
      message: "Bornas guardadas: 2 hilos corregidos.",
    });
    expect(mocks.editWiring).toHaveBeenCalledWith(
      technician.user,
      expect.objectContaining({ cableId: "c1" }),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/cables/c1");
  });

  it("returns the repeated terminals as sentences, to confirm", async () => {
    mocks.editWiring.mockResolvedValue({
      status: "duplicates",
      cableId: "c1",
      duplicates: [{ end: "origin", block: "X51", point: "11", wires: ["BN", "BU"] }],
    });

    expect(await editWiringAction(input)).toMatchObject({
      ok: false,
      duplicates: ["Origen: el BN y el BU van a X51 · 11."],
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("shows the service's own errors and hides unexpected ones", async () => {
    mocks.editWiring.mockRejectedValueOnce(new CableServiceError("El cable está dado de baja."));
    expect(await editWiringAction(input)).toEqual({
      ok: false,
      message: "El cable está dado de baja.",
    });

    mocks.editWiring.mockRejectedValueOnce(new Error("conexión perdida"));
    expect(await editWiringAction(input)).toEqual({
      ok: false,
      message: "No se pudo guardar. Inténtalo de nuevo.",
    });
  });
});
