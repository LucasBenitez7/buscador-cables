import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ActivityEntry } from "@/server/activity/service";
import type { CableProgress, Dashboard as DashboardData } from "@/server/dashboard/service";
import { Dashboard } from "./dashboard";

const progress: CableProgress = {
  total: 200,
  laid: 50,
  connected: 20,
  installation: {
    UNVERIFIED: 100,
    IN_STOCK: 10,
    COILED: 30,
    PARTIALLY_LAID: 10,
    LAID: 50,
    RETIRED: 0,
  },
  connection: { DISCONNECTED: 160, ORIGIN_ONLY: 15, DESTINATION_ONLY: 5, CONNECTED: 20 },
};

const entry: ActivityEntry = {
  id: "e1",
  at: new Date("2026-11-13T10:00:00Z"),
  action: "LAID",
  user: "Juan Pérez",
  cable: { id: "c1", code: "SH-50", deleted: false },
  summary: "tendió el cable",
  notes: null,
  changes: [],
};

const viewer: DashboardData = { progress, myActivity: null, team: null, admin: null };

describe("Dashboard", () => {
  it("shows everybody the quick search and the progress of the works", () => {
    render(<Dashboard data={viewer} />);

    expect(screen.getByRole("search", { name: "Buscar un cable" })).toHaveAttribute(
      "action",
      "/cables",
    );
    expect(screen.getByRole("search", { name: "Buscar una bandeja" })).toHaveAttribute(
      "action",
      "/trays",
    );
    expect(screen.getByRole("progressbar", { name: "Tendidos" })).toHaveAttribute(
      "aria-valuenow",
      "25",
    );
    expect(screen.getByRole("progressbar", { name: "Conectados" })).toHaveAttribute(
      "aria-valuenow",
      "10",
    );
    expect(screen.getByRole("link", { name: /10 cables tendidos a medias/ })).toHaveAttribute(
      "href",
      "/cables?loose=1",
    );
  });

  it("keeps a viewer's page short: no activity, breakdown or accounts", () => {
    render(<Dashboard data={viewer} />);

    expect(screen.getByRole("heading", { name: "Accesos directos" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /actividad/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Estado de los cables" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Usuarios activos" })).toBeNull();
    expect(screen.queryByTestId("health-database")).toBeNull();
  });

  it("shows a technician their own latest actions", () => {
    render(<Dashboard data={{ ...viewer, myActivity: [entry] }} />);

    const panel = screen
      .getByRole("heading", { name: "Tu actividad reciente" })
      .closest("section")!;
    expect(within(panel).getByRole("link", { name: "SH-50" })).toHaveAttribute(
      "href",
      "/cables/c1",
    );
    // En "tu" actividad no se repite el nombre.
    expect(within(panel).queryByText(/Juan Pérez/)).toBeNull();
    expect(screen.queryByRole("heading", { name: "Estado de los cables" })).toBeNull();
  });

  it("gives a supervisor the status breakdown, linked to the search, and the team's activity", () => {
    render(
      <Dashboard
        data={{ ...viewer, myActivity: [], team: { trays: 3017, recentActivity: [entry] } }}
      />,
    );

    const breakdown = screen.getByRole("heading", { name: "Estado de los cables" }).parentElement!
      .parentElement!;
    expect(within(breakdown).getByRole("link", { name: /^Tendido parcial/ })).toHaveAttribute(
      "href",
      "/cables?installation=PARTIALLY_LAID",
    );
    expect(within(breakdown).getByRole("link", { name: /^Conectado/ })).toHaveAttribute(
      "href",
      "/cables?connection=CONNECTED",
    );
    const team = screen.getByRole("heading", { name: "Actividad del equipo" }).closest("section")!;
    expect(within(team).getByText(/Juan Pérez/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Usuarios activos" })).toBeNull();
  });

  it("gives an administrator the accounts, pending approvals and the system state", () => {
    render(
      <Dashboard
        data={{
          ...viewer,
          myActivity: [],
          team: { trays: 10, recentActivity: [] },
          admin: {
            pendingAccounts: 2,
            activeUsers: { ADMIN: 1, SUPERVISOR: 2, TECHNICIAN: 5, VIEWER: 3 },
            database: "ok",
          },
        }}
      />,
    );

    expect(screen.getByText("2 cuentas pendientes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Revisar cuentas" })).toHaveAttribute(
      "href",
      "/admin/users",
    );
    expect(screen.getByRole("heading", { name: "Usuarios activos" })).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByTestId("health-database")).toHaveAttribute("data-status", "ok");
  });

  it("does not warn about accounts when none is pending", () => {
    render(
      <Dashboard
        data={{
          ...viewer,
          team: { trays: 0, recentActivity: [] },
          admin: {
            pendingAccounts: 0,
            activeUsers: { ADMIN: 1, SUPERVISOR: 0, TECHNICIAN: 0, VIEWER: 0 },
            database: "ok",
          },
        }}
      />,
    );

    expect(screen.queryByRole("link", { name: "Revisar cuentas" })).toBeNull();
  });
});
