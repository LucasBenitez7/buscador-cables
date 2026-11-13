import { render, screen, within } from "@testing-library/react";
import type { CableState } from "@cables/shared";
import { describe, expect, it } from "vitest";
import type { CableDetail } from "@/server/cables/detail";
import { CableEnds, CableRoute } from "./cable-route";

const state: CableState = {
  installationStatus: "PARTIALLY_LAID",
  connectionStatus: "ORIGIN_ONLY",
  currentLocationId: null,
  looseEnd: "DESTINATION",
  looseEndTray: "99UXA00L22051",
  originId: "99BMA",
  destinationId: "99XAT10AP001",
  deleted: false,
};

const route: CableDetail["route"] = [
  { position: 1, label: "99UXA00L22036", trayCode: "99UXA00L22036", section: "FIELD" },
  { position: 2, label: "(NOTE 1)", trayCode: null, section: "FIELD" },
  { position: 3, label: "99UXA00L22051", trayCode: "99UXA00L22051", section: "ROOM" },
  { position: 4, label: "99UXB01L10030", trayCode: "99UXB01L10030", section: "ROOM" },
];

const end = (fields: Partial<CableDetail["ends"]["origin"]>): CableDetail["ends"]["origin"] => ({
  equipment: null,
  cubicle: null,
  gland: null,
  functionKks: null,
  installationKks: null,
  room: null,
  location: null,
  ...fields,
});

describe("CableRoute", () => {
  it("shows how far a partially laid cable got and where the loose end waits", () => {
    render(<CableRoute route={route} state={state} />);

    expect(screen.getByText(/Faltan 1 tramos/)).toBeInTheDocument();
    const steps = within(screen.getByRole("list", { name: "Tramos del recorrido" }));
    expect(steps.getByRole("link", { name: "99UXA00L22036" })).toHaveAttribute(
      "href",
      "/trays/99UXA00L22036",
    );
    // Notes of the list are text, not links.
    expect(steps.queryByRole("link", { name: "(NOTE 1)" })).toBeNull();
    expect(steps.getByText("Campo")).toBeInTheDocument();
    expect(steps.getByText("Sala")).toBeInTheDocument();
    expect(steps.getByText("Aquí espera la punta de destino")).toBeInTheDocument();
    const progress = [...document.querySelectorAll("[data-progress]")].map((row) =>
      row.getAttribute("data-progress"),
    );
    expect(progress).toEqual(["laid", "laid", "laid", "pending"]);
  });

  it("says when the list gives no trays", () => {
    render(<CableRoute route={[]} state={state} />);

    expect(screen.getByText(/El listado no da bandejas/)).toBeInTheDocument();
  });
});

describe("CableEnds", () => {
  it("shows the equipment of each end, its details and the loose end", () => {
    render(
      <CableEnds
        state={state}
        ends={{
          origin: end({ equipment: "99BMA", cubicle: "H03", functionKks: "=99BMA00GS101" }),
          destination: end({ room: "99UXA16RA001", location: "99 › 99UX › 99UXA › 99UXA16RA001" }),
        }}
      />,
    );

    const origin = within(screen.getByRole("region", { name: "Origen" }));
    expect(origin.getByText("99BMA")).toBeInTheDocument();
    expect(origin.getByText("H03")).toBeInTheDocument();
    expect(origin.queryByText(/Punta suelta/)).toBeNull();

    const destination = within(screen.getByRole("region", { name: "Destino" }));
    expect(destination.getByText("Equipo sin indicar")).toBeInTheDocument();
    expect(destination.getByText("99 › 99UX › 99UXA › 99UXA16RA001")).toBeInTheDocument();
    expect(destination.getByText(/Punta suelta en/)).toBeInTheDocument();
  });
});
