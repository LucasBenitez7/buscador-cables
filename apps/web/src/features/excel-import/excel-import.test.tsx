import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewActions, RowCheckbox, SelectTabButtons } from "./components/preview-controls";
import { DecisionButtons } from "./components/decision-buttons";
import { UploadExcelForm } from "./components/upload-excel-form";

const mocks = vi.hoisted(() => ({
  startExcelUploadAction: vi.fn(),
  addExcelPartAction: vi.fn(),
  finishExcelUploadAction: vi.fn(),
  setExcelRowsAction: vi.fn(),
  discardExcelAction: vi.fn(),
  applyExcelBatchAction: vi.fn(),
  decideDiscrepancyAction: vi.fn(),
  readExcelFile: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/features/excel-import/actions", () => mocks);
vi.mock("@/features/excel-import/read-excel", () => ({ readExcelFile: mocks.readExcelFile }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

// Datos inventados.
const row = (code: string) => ({
  row: 2,
  code,
  installationStatus: "LAID",
  connectionStatus: "CONNECTED",
  laidOn: null,
  company: null,
  reel: null,
  reelStatus: null,
  actualLengthTotalM: null,
  sections: null,
  actualLengthM: null,
});

function pickFile(name = "estado_16.11.26.xlsx") {
  fireEvent.change(screen.getByLabelText("Archivo"), {
    target: { files: [new File(["x"], name)] },
  });
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});

describe("UploadExcelForm", () => {
  it("reads the file, proposes its date and sends it in parts before opening the preview", async () => {
    mocks.readExcelFile.mockResolvedValue({
      ok: true,
      kind: "ELECTRICAL",
      rows: Array.from({ length: 1001 }, (_, index) => row(`ZZ-${index}`)),
      ignored: [],
      excelDate: "2026-11-16",
    });
    mocks.startExcelUploadAction.mockResolvedValue({ ok: true, importId: "i1" });
    mocks.addExcelPartAction.mockResolvedValue({ ok: true });
    mocks.finishExcelUploadAction.mockResolvedValue({ ok: true, importId: "i1" });
    render(<UploadExcelForm projectLoadKinds={[]} />);

    pickFile();
    expect(await screen.findByText("Eléctrico")).toBeInTheDocument();
    expect(screen.getByText(/1001 cables/)).toBeInTheDocument();
    expect(screen.getByLabelText("Fecha del Excel")).toHaveValue("2026-11-16");
    expect(screen.queryByLabelText("Carga del proyecto")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Preparar vista previa" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/import/i1"));
    expect(mocks.startExcelUploadAction).toHaveBeenCalledWith({
      kind: "ELECTRICAL",
      excelDate: "2026-11-16",
      fileName: "estado_16.11.26.xlsx",
      projectLoad: false,
      rowCount: 1001,
    });
    expect(mocks.addExcelPartAction).toHaveBeenCalledTimes(2);
  });

  it("offers the project load only for its kinds, and shows why a file is refused", async () => {
    mocks.readExcelFile.mockResolvedValueOnce({ ok: false, message: "Faltan columnas: TAG." });
    render(<UploadExcelForm projectLoadKinds={["INSTRUMENTATION"]} />);

    pickFile("otro.xlsx");
    expect(await screen.findByRole("alert")).toHaveTextContent("Faltan columnas: TAG.");
    expect(screen.getByRole("button", { name: "Preparar vista previa" })).toBeDisabled();

    mocks.readExcelFile.mockResolvedValueOnce({
      ok: true,
      kind: "INSTRUMENTATION",
      rows: [row("ZZ-1")],
      ignored: [],
      excelDate: null,
    });
    pickFile("instrumentacion.xlsx");
    expect(await screen.findByLabelText("Carga del proyecto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preparar vista previa" })).toBeDisabled();
  });

  it("stops and says why when the server refuses a part", async () => {
    mocks.readExcelFile.mockResolvedValue({
      ok: true,
      kind: "ELECTRICAL",
      rows: [row("ZZ-1")],
      ignored: [],
      excelDate: "2026-11-16",
    });
    mocks.startExcelUploadAction.mockResolvedValue({ ok: true, importId: "i1" });
    mocks.addExcelPartAction.mockResolvedValue({ ok: false, message: "Está repetido." });
    render(<UploadExcelForm projectLoadKinds={[]} />);

    pickFile();
    fireEvent.click(await screen.findByRole("button", { name: "Preparar vista previa" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Está repetido.");
    expect(mocks.finishExcelUploadAction).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe("PreviewActions", () => {
  it("applies batch after batch until it is done", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.applyExcelBatchAction
      .mockResolvedValueOnce({ ok: true, applied: 200, remaining: 50, done: false })
      .mockResolvedValueOnce({ ok: true, applied: 50, remaining: 0, done: true });
    render(<PreviewActions importId="i1" excelDay="16/11/2026" pending={250} applying={false} />);

    fireEvent.click(screen.getByRole("button", { name: /Aplicar/ }));

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(window.confirm).toHaveBeenCalledWith("¿Aplicar 250 cables del Excel del 16/11/2026?");
    expect(mocks.applyExcelBatchAction).toHaveBeenCalledTimes(2);
  });

  it("does nothing without confirming, and stops at the first error", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    mocks.applyExcelBatchAction.mockResolvedValue({ ok: false, message: "Alguien ha cambiado." });
    render(<PreviewActions importId="i1" excelDay="16/11/2026" pending={1} applying={false} />);

    fireEvent.click(screen.getByRole("button", { name: /Aplicar/ }));
    expect(mocks.applyExcelBatchAction).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /Aplicar/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Alguien ha cambiado.");
    expect(mocks.applyExcelBatchAction).toHaveBeenCalledTimes(1);
  });

  it("continues an Excel left half applied without asking again and without discarding", () => {
    render(<PreviewActions importId="i1" excelDay="16/11/2026" pending={5} applying />);

    expect(screen.getByRole("button", { name: /Seguir aplicando/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Descartar" })).toBeNull();
  });

  it("discards after confirming and goes back to the list", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.discardExcelAction.mockResolvedValue({ ok: true, message: "Vista previa descartada." });
    render(<PreviewActions importId="i1" excelDay="16/11/2026" pending={3} applying={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/import"));
  });
});

describe("row selection", () => {
  it("saves a row unmarked at once", async () => {
    mocks.setExcelRowsAction.mockResolvedValue({ ok: true, count: 1 });
    render(<RowCheckbox importId="i1" rowId="r1" code="ZZ-1" selected disabled={false} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Aplicar ZZ-1" }));

    await waitFor(() =>
      expect(mocks.setExcelRowsAction).toHaveBeenCalledWith({
        importId: "i1",
        rowIds: ["r1"],
        selected: false,
      }),
    );
  });

  it("marks or unmarks every row of the tab", async () => {
    mocks.setExcelRowsAction.mockResolvedValue({ ok: false, message: "Ya se está aplicando." });
    render(<SelectTabButtons importId="i1" kind="NEW" />);

    fireEvent.click(screen.getByRole("button", { name: "Desmarcar todas" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ya se está aplicando.");
    expect(mocks.setExcelRowsAction).toHaveBeenCalledWith({
      importId: "i1",
      kind: "NEW",
      selected: false,
    });
  });
});

describe("DecisionButtons", () => {
  it("sends the decision and shows why it was refused", async () => {
    mocks.decideDiscrepancyAction.mockResolvedValue({
      ok: false,
      message: "Otra persona ya ha decidido esta discrepancia.",
    });
    render(<DecisionButtons id="d1" code="ZZ-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Aceptar lo del Excel: ZZ-1" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ya ha decidido");
    expect(mocks.decideDiscrepancyAction).toHaveBeenCalledWith({
      id: "d1",
      decision: "ACCEPT_EXCEL",
    });
  });
});
