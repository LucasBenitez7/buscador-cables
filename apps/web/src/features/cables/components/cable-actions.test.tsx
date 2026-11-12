import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cableActionAvailability, type CableState, type Role } from "@cables/shared";
import { CableActions } from "./cable-actions";
import { CableStatusBadges } from "./cable-status-badges";

const mocks = vi.hoisted(() => ({ runCableActionAction: vi.fn(), refresh: vi.fn() }));

vi.mock("@/features/cables/actions", () => ({ runCableActionAction: mocks.runCableActionAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

const locations = [
  { id: "store", label: "Norte › Almacén" },
  { id: "yard", label: "Norte › Patio" },
];
const laid: CableState = {
  installationStatus: "LAID",
  connectionStatus: "DISCONNECTED",
  currentLocationId: null,
  originId: "o",
  destinationId: "d",
  deleted: false,
};

function renderActions(role: Role, state: CableState = laid) {
  render(
    <CableActions
      cableId="c1"
      code="SH-50"
      version={3}
      state={state}
      availability={cableActionAvailability(role, state)}
      locations={locations}
      events={[{ id: "e1", label: "Tendido · Tomás · 11/11/26" }]}
    />,
  );
}

const sentForm = () =>
  Object.fromEntries(mocks.runCableActionAction.mock.calls[0]?.[0] as FormData);

describe("CableActions", () => {
  beforeEach(() => {
    mocks.runCableActionAction.mockReset();
    mocks.refresh.mockReset();
  });

  it("renders nothing for a viewer", () => {
    renderActions("VIEWER");

    expect(screen.queryByRole("heading", { name: "Acciones" })).toBeNull();
  });

  it("disables what makes no sense now and explains why", () => {
    renderActions("TECHNICIAN");

    expect(screen.getByRole("button", { name: "Conectar" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Enrollar" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Tender" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mover" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Retirar" })).toBeNull();
    expect(screen.getByText(/primero enróllalo/)).toBeInTheDocument();
  });

  it("connects the missing end and refreshes the record", async () => {
    mocks.runCableActionAction.mockResolvedValue({
      ok: true,
      message: "Movimiento registrado en SH-50: conectado.",
      id: "c1",
    });
    renderActions("TECHNICIAN", { ...laid, connectionStatus: "ORIGIN_ONLY" });

    fireEvent.click(screen.getByRole("button", { name: "Conectar" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Extremo de destino")).toBeChecked();
    fireEvent.change(within(dialog).getByLabelText("Nota (opcional)"), {
      target: { value: "Borna 4" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Conectar" }));

    await screen.findByText("Movimiento registrado en SH-50: conectado.");
    expect(sentForm()).toEqual({
      cableId: "c1",
      version: "3",
      action: "CONNECTED",
      end: "DESTINATION",
      notes: "Borna 4",
    });
    expect(mocks.refresh).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the dialog open and shows the server error", async () => {
    mocks.runCableActionAction.mockResolvedValue({
      ok: false,
      message: "Otra persona ha registrado un movimiento en este cable mientras tanto.",
    });
    renderActions("TECHNICIAN");

    fireEvent.click(screen.getByRole("button", { name: "Enrollar" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Dónde queda enrollado"), {
      target: { value: "yard" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Enrollar" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/Otra persona/);
    expect(sentForm()).toMatchObject({ action: "COILED", locationId: "yard" });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("does not offer the current location when moving", async () => {
    renderActions("TECHNICIAN", {
      ...laid,
      installationStatus: "COILED",
      currentLocationId: "store",
    });

    fireEvent.click(screen.getByRole("button", { name: "Mover" }));
    const select = within(await screen.findByRole("dialog")).getByLabelText("Nuevo sitio");

    expect(within(select).queryByRole("option", { name: "Norte › Almacén" })).toBeNull();
    expect(within(select).getByRole("option", { name: "Norte › Patio" })).toBeInTheDocument();
  });

  it("asks a supervisor for a reason to retire and shows field errors", async () => {
    mocks.runCableActionAction.mockResolvedValue({
      ok: false,
      message: "Revisa los campos marcados.",
      fieldErrors: { notes: "Indica el motivo" },
    });
    renderActions("SUPERVISOR");

    fireEvent.click(screen.getByRole("button", { name: "Retirar" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Motivo")).toBeRequired();
    fireEvent.click(within(dialog).getByRole("button", { name: "Retirar" }));

    expect(await within(dialog).findByText("Indica el motivo")).toBeInTheDocument();
  });

  it("lets a supervisor pick the event to correct and the target state", async () => {
    renderActions("SUPERVISOR");

    fireEvent.click(screen.getByRole("button", { name: "Corregir" }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByLabelText("Movimiento que corriges")).toHaveValue("");
    expect(within(dialog).getByLabelText("Estado de instalación correcto")).toHaveValue("LAID");
    expect(within(dialog).getByLabelText("Dónde está (si no está tendido)")).toHaveValue("");
    expect(within(dialog).getByRole("option", { name: /Tendido · Tomás/ })).toBeInTheDocument();
  });
});

describe("CableStatusBadges", () => {
  it("colours connected green, half connected amber and retired red", () => {
    const { rerender } = render(
      <CableStatusBadges installationStatus="LAID" connectionStatus="CONNECTED" />,
    );
    expect(screen.getByText("Conectado")).toHaveClass("text-success");

    rerender(<CableStatusBadges installationStatus="LAID" connectionStatus="ORIGIN_ONLY" />);
    expect(screen.getByText("Solo origen")).toHaveClass("text-warning");

    rerender(<CableStatusBadges installationStatus="RETIRED" connectionStatus="DISCONNECTED" />);
    expect(screen.getByText("Retirado")).toHaveClass("text-destructive");
    expect(screen.getByText("Desconectado")).not.toHaveClass("text-success");
  });
});
