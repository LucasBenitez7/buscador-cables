// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  revalidatePath: vi.fn(),
  startExcelPreview: vi.fn(),
  addExcelPreviewPart: vi.fn(),
  finishExcelPreview: vi.fn(),
  setExcelRowsSelected: vi.fn(),
  discardExcelPreview: vi.fn(),
  applyExcelBatch: vi.fn(),
  decideDiscrepancy: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/session", () => ({ authorize: mocks.authorize }));
vi.mock("@/server/excel-import/service", () => ({
  ExcelImportError: class ExcelImportError extends Error {},
  startExcelPreview: mocks.startExcelPreview,
  addExcelPreviewPart: mocks.addExcelPreviewPart,
  finishExcelPreview: mocks.finishExcelPreview,
  setExcelRowsSelected: mocks.setExcelRowsSelected,
  discardExcelPreview: mocks.discardExcelPreview,
  applyExcelBatch: mocks.applyExcelBatch,
}));

vi.mock("@/server/excel-import/discrepancies", () => ({
  decideDiscrepancy: mocks.decideDiscrepancy,
}));

const actions = await import("./actions");
const { ExcelImportError } = await import("@/server/excel-import/service");

const user = { id: "u1", role: "SUPERVISOR", permissions: ["import:run"] };

describe("Excel import actions", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.authorize.mockResolvedValue({ ok: true, user });
  });

  it("require the import permission and touch nothing without it", async () => {
    mocks.authorize.mockResolvedValue({ ok: false, message: "No tienes permiso." });

    expect(await actions.startExcelUploadAction({})).toEqual({
      ok: false,
      message: "No tienes permiso.",
    });
    expect(mocks.authorize).toHaveBeenCalledWith("import:run");
    expect(mocks.startExcelPreview).not.toHaveBeenCalled();
  });

  it("pass what the browser sends to the service, which validates it", async () => {
    mocks.startExcelPreview.mockResolvedValue("i1");
    mocks.finishExcelPreview.mockResolvedValue({ importId: "i1", counts: {}, ignored: 0 });

    expect(await actions.startExcelUploadAction({ kind: "ELECTRICAL" })).toEqual({
      ok: true,
      importId: "i1",
    });
    expect(mocks.startExcelPreview).toHaveBeenCalledWith(user, { kind: "ELECTRICAL" });
    expect(await actions.addExcelPartAction({ importId: "i1" })).toEqual({ ok: true });
    expect(await actions.finishExcelUploadAction("i1")).toMatchObject({ ok: true, importId: "i1" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/import");
  });

  it("show the service's own errors and hide unexpected ones", async () => {
    mocks.addExcelPreviewPart.mockRejectedValueOnce(new ExcelImportError("Está repetido."));
    expect(await actions.addExcelPartAction({})).toEqual({ ok: false, message: "Está repetido." });

    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.applyExcelBatch.mockRejectedValueOnce(new Error("conexión perdida"));
    expect(await actions.applyExcelBatchAction("i1")).toEqual({
      ok: false,
      message: "No se pudo completar la operación. Inténtalo de nuevo.",
    });
  });

  it("apply batch by batch, refreshing the app only at the end", async () => {
    mocks.applyExcelBatch.mockResolvedValueOnce({ applied: 200, remaining: 1, done: false });
    mocks.applyExcelBatch.mockResolvedValueOnce({ applied: 1, remaining: 0, done: true });

    expect(await actions.applyExcelBatchAction("i1")).toMatchObject({ ok: true, done: false });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(await actions.applyExcelBatchAction("i1")).toMatchObject({ ok: true, done: true });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("mark rows and discard a preview", async () => {
    mocks.setExcelRowsSelected.mockResolvedValue(3);

    expect(await actions.setExcelRowsAction({ importId: "i1", selected: false })).toEqual({
      ok: true,
      count: 3,
    });
    expect(await actions.discardExcelAction("i1")).toEqual({
      ok: true,
      message: "Vista previa descartada.",
    });
    expect(mocks.discardExcelPreview).toHaveBeenCalledWith(user, "i1");
  });

  it("decide a discrepancy only with the permission to correct movements", async () => {
    mocks.decideDiscrepancy.mockResolvedValue("ZZ-1: se mantiene lo de la web.");

    expect(await actions.decideDiscrepancyAction({ id: "d1", decision: "KEEP_WEB" })).toEqual({
      ok: true,
      message: "ZZ-1: se mantiene lo de la web.",
    });
    expect(mocks.authorize).toHaveBeenCalledWith("cable:correct");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");

    mocks.authorize.mockResolvedValue({ ok: false, message: "No tienes permiso." });
    expect(await actions.decideDiscrepancyAction({})).toEqual({
      ok: false,
      message: "No tienes permiso.",
    });
    expect(mocks.decideDiscrepancy).toHaveBeenCalledTimes(1);
  });
});
