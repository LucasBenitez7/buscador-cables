import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewActions, RowCheckbox, SelectTabButtons } from "./components/preview-controls";
import { DecisionButtons } from "./components/decision-buttons";
import { DiscrepancyList } from "./components/discrepancy-list";
import { UploadExcelForm } from "./components/upload-excel-form";

const mocks = vi.hoisted(() => ({
  startExcelUploadAction: vi.fn(),
  addExcelPartAction: vi.fn(),
  finishExcelUploadAction: vi.fn(),
  cancelExcelUploadAction: vi.fn(),
  setExcelRowsAction: vi.fn(),
  discardExcelAction: vi.fn(),
  applyExcelBatchAction: vi.fn(),
  decideDiscrepancyAction: vi.fn(),
  decideDiscrepanciesAction: vi.fn(),
  markDiscrepanciesSeenAction: vi.fn(),
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
    render(<UploadExcelForm />);

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

  it("never offers the project load any more, and shows why a file is refused", async () => {
    mocks.readExcelFile.mockResolvedValueOnce({ ok: false, message: "Faltan columnas: TAG." });
    render(<UploadExcelForm />);

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
    // La carga del proyecto ya se hizo (fase 17): la casilla no vuelve a salir.
    expect(await screen.findByLabelText("Fecha del Excel")).toBeInTheDocument();
    expect(screen.queryByLabelText("Carga del proyecto")).toBeNull();
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
    render(<UploadExcelForm />);

    pickFile();
    fireEvent.click(await screen.findByRole("button", { name: "Preparar vista previa" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Está repetido.");
    expect(mocks.finishExcelUploadAction).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe("UploadExcelForm: quitar y cancelar", () => {
  const readOk = () =>
    mocks.readExcelFile.mockResolvedValue({
      ok: true,
      kind: "INSTRUMENTATION",
      rows: [row("ZZ-1")],
      ignored: [],
      excelDate: "2026-11-16",
    });

  it("«Quitar archivo» empties the form", async () => {
    readOk();
    render(<UploadExcelForm />);
    expect(screen.queryByRole("button", { name: "Quitar archivo" })).toBeNull();

    pickFile();
    fireEvent.click(await screen.findByRole("button", { name: "Quitar archivo" }));
    expect(screen.queryByText("Instrumentación")).toBeNull();
    expect(screen.queryByLabelText("Fecha del Excel")).toBeNull();
    expect(screen.getByRole("button", { name: "Preparar vista previa" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Quitar archivo" })).toBeNull();
  });

  it("«Cancelar» stops a preview being prepared and discards what the server has", async () => {
    readOk();
    let sendPart: (value: { ok: true }) => void = () => {};
    mocks.startExcelUploadAction.mockResolvedValue({ ok: true, importId: "i2" });
    mocks.addExcelPartAction.mockReturnValue(new Promise((resolve) => (sendPart = resolve)));
    mocks.cancelExcelUploadAction.mockResolvedValue({ ok: true });
    render(<UploadExcelForm />);

    pickFile();
    fireEvent.click(await screen.findByRole("button", { name: "Preparar vista previa" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("Instrumentación")).toBeNull();

    sendPart({ ok: true });
    await waitFor(() => expect(mocks.cancelExcelUploadAction).toHaveBeenCalledWith("i2"));
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

describe("DiscrepancyList", () => {
  const item = (id: string, code: string, webBefore: string | null = null) => ({
    id,
    cable: { id: `c-${id}`, code },
    web: "Tendido",
    webBefore,
    webBy: "Tomás",
    webAt: "12/11/26, 10:30",
    excel: "No tendido",
    excelDay: "16/11/2026",
    agreesOn: null,
    decision: null,
  });

  it("says when somebody changed the cable in the web after the discrepancy", () => {
    render(
      <DiscrepancyList
        items={[item("d1", "ZZ-1", "Tendido · Conectado")]}
        pending
        total={1}
        empty="Nada."
      />,
    );

    expect(screen.getByText("Cambiado en la web después")).toBeInTheDocument();
    expect(
      screen.getByText("Antes: Tendido · Conectado (Tomás · 12/11/26, 10:30)"),
    ).toBeInTheDocument();
  });

  it("decides every pending one batch by batch and keeps the result on the screen", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.decideDiscrepanciesAction
      .mockResolvedValueOnce({ ok: true, decided: 1, failed: [], remaining: 1 })
      .mockResolvedValueOnce({
        ok: true,
        decided: 0,
        failed: [{ id: "d9", code: "ZZ-9", message: "Ya decidida." }],
        remaining: 0,
      });
    const { rerender } = render(
      <DiscrepancyList items={[item("d1", "ZZ-1")]} pending total={2} empty="Nada." />,
    );

    fireEvent.click(screen.getByLabelText("Seleccionar todas (2)"));
    fireEvent.click(screen.getByRole("button", { name: "Mantener lo de la web (2)" }));

    expect(await screen.findByRole("status")).toHaveTextContent("1 decidida. ZZ-9: Ya decidida.");
    expect(mocks.decideDiscrepanciesAction).toHaveBeenLastCalledWith({
      all: true,
      decision: "KEEP_WEB",
      skip: [],
    });
    expect(mocks.refresh).toHaveBeenCalled();
    // La lista vacía sigue en pantalla con su aviso.
    rerender(<DiscrepancyList items={[]} pending total={0} empty="Nada." />);
    expect(screen.getByText("Nada.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("decides only the ticked ones", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.decideDiscrepanciesAction.mockResolvedValue({
      ok: true,
      decided: 1,
      failed: [],
      remaining: 0,
    });
    render(
      <DiscrepancyList
        items={[item("d1", "ZZ-1"), item("d2", "ZZ-2")]}
        pending
        total={2}
        empty="Nada."
      />,
    );

    fireEvent.click(screen.getByLabelText("Seleccionar ZZ-2"));
    fireEvent.click(screen.getByRole("button", { name: "Aceptar lo del Excel (1)" }));

    await waitFor(() =>
      expect(mocks.decideDiscrepanciesAction).toHaveBeenCalledWith({
        ids: ["d2"],
        decision: "ACCEPT_EXCEL",
      }),
    );
  });
});
