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
  testStatus: "NOT_TESTED",
  currentLocationId: null,
  looseEnd: null,
  looseEndTray: null,
  originId: "o",
  destinationId: "d",
  deleted: false,
};

function renderActions(role: Role, state: CableState = laid, routeTrays: string[] = []) {
  render(
    <CableActions
      cableId="c1"
      code="SH-50"
      version={3}
      state={state}
      availability={cableActionAvailability(role, state)}
      locations={locations}
      events={[{ id: "e1", label: "Tendido · Tomás · 11/11/26" }]}
      routeTrays={routeTrays}
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

describe("CableActions: partial laying", () => {
  const partial: CableState = {
    ...laid,
    installationStatus: "PARTIALLY_LAID",
    connectionStatus: "ORIGIN_ONLY",
    looseEnd: "DESTINATION",
    looseEndTray: "99UXA00L22036",
  };

  beforeEach(() => {
    mocks.runCableActionAction.mockReset();
    mocks.refresh.mockReset();
  });

  it("asks which end stays loose and offers the route trays as buttons, in order", async () => {
    mocks.runCableActionAction.mockResolvedValue({ ok: true, message: "Hecho", id: "c1" });
    renderActions("TECHNICIAN", { ...laid, connectionStatus: "ORIGIN_ONLY" }, [
      "99UXA00L22036",
      "99UXA00L22051",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Tender a medias" }));
    const dialog = await screen.findByRole("dialog");
    // The origin is connected, so the destination is the end that can stay loose.
    expect(within(dialog).getByLabelText("Destino")).toBeChecked();
    const route = within(dialog).getByRole("list", { name: "Bandejas del recorrido" });
    expect(
      within(route)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["1. 99UXA00L22036", "2. 99UXA00L22051"]);

    fireEvent.click(within(route).getByRole("button", { name: "2. 99UXA00L22051" }));
    expect(within(dialog).getByLabelText("Bandeja donde está la punta")).toHaveValue(
      "99UXA00L22051",
    );
    expect(within(route).getByRole("button", { name: "2. 99UXA00L22051" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // On the route: nothing to confirm.
    expect(within(dialog).queryByRole("checkbox")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Tender a medias" }));

    await screen.findByText("Hecho");
    expect(sentForm()).toMatchObject({
      action: "PARTIALLY_LAID",
      looseEnd: "DESTINATION",
      trayCode: "99UXA00L22051",
    });
  });

  it("asks to confirm a tray that is not on the planned route", async () => {
    mocks.runCableActionAction.mockResolvedValue({ ok: true, message: "Hecho", id: "c1" });
    renderActions("TECHNICIAN", { ...laid, connectionStatus: "ORIGIN_ONLY" }, ["99UXA00L22036"]);

    fireEvent.click(screen.getByRole("button", { name: "Tender a medias" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Bandeja donde está la punta"), {
      target: { value: "99uxa00l22099" },
    });
    const confirm = within(dialog).getByRole("checkbox", { name: /no está en su recorrido/ });
    fireEvent.click(confirm);
    fireEvent.click(within(dialog).getByRole("button", { name: "Tender a medias" }));

    await screen.findByText("Hecho");
    expect(sentForm()).toMatchObject({ trayCode: "99uxa00l22099", confirmOffRoute: "1" });
  });

  it("works without a route: the tray is typed", async () => {
    renderActions("TECHNICIAN", {
      ...laid,
      installationStatus: "COILED",
      currentLocationId: "store",
    });

    fireEvent.click(screen.getByRole("button", { name: "Tender a medias" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Bandeja donde está la punta")).toHaveValue("");
    expect(within(dialog).queryByRole("list", { name: "Bandejas del recorrido" })).toBeNull();
  });

  it("explains that laying a partially laid cable completes it", async () => {
    renderActions("TECHNICIAN", partial);

    fireEvent.click(screen.getByRole("button", { name: "Tender" }));
    expect(await screen.findByText(/La punta suelta llega a su extremo/)).toBeInTheDocument();
  });

  it("proposes connecting only the end that arrived", async () => {
    renderActions("TECHNICIAN", { ...partial, connectionStatus: "DISCONNECTED" });

    fireEvent.click(screen.getByRole("button", { name: "Conectar" }));
    expect(
      within(await screen.findByRole("dialog")).getByLabelText("Extremo de origen"),
    ).toBeChecked();
  });

  it("lets a supervisor correct the loose end", async () => {
    renderActions("SUPERVISOR", partial);

    fireEvent.click(screen.getByRole("button", { name: "Corregir" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Punta suelta (si está tendido a medias)")).toHaveValue(
      "DESTINATION",
    );
    expect(within(dialog).getByLabelText("Bandeja de la punta suelta")).toHaveValue(
      "99UXA00L22036",
    );
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

    rerender(
      <CableStatusBadges installationStatus="PARTIALLY_LAID" connectionStatus="ORIGIN_ONLY" />,
    );
    expect(screen.getByText("Tendido parcial")).toHaveClass("text-warning");

    rerender(<CableStatusBadges installationStatus="RETIRED" connectionStatus="DISCONNECTED" />);
    expect(screen.getByText("Retirado")).toHaveClass("text-destructive");
    expect(screen.getByText("Desconectado")).not.toHaveClass("text-success");
  });
});

describe("CableActions: timbrado", () => {
  beforeEach(() => {
    mocks.runCableActionAction.mockReset();
    mocks.refresh.mockReset();
  });

  it("records the result, correct by default", async () => {
    mocks.runCableActionAction.mockResolvedValue({ ok: true, message: "Hecho", id: "c1" });
    renderActions("TECHNICIAN", laid);

    fireEvent.click(screen.getByRole("button", { name: "Timbrar" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Correcto")).toBeChecked();
    expect(within(dialog).getByLabelText("Nota (obligatoria si falla)")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText("Con fallo"));
    fireEvent.change(within(dialog).getByLabelText("Nota (obligatoria si falla)"), {
      target: { value: "Conductor 3 abierto" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Timbrar" }));

    await screen.findByText("Hecho");
    expect(sentForm()).toMatchObject({
      action: "TESTED",
      result: "FAILED",
      notes: "Conductor 3 abierto",
    });
  });

  it("is not offered to a viewer", () => {
    renderActions("VIEWER", laid);

    expect(screen.queryByRole("button", { name: "Timbrar" })).toBeNull();
  });
});
