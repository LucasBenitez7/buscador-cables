import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ActivityEntry } from "@/server/activity/service";
import type { CableProgress, Dashboard as DashboardData } from "@/server/dashboard/service";
import { Dashboard } from "./dashboard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const progress: CableProgress = {
  total: 200,
  laid: 50,
  connected: 20,
  installation: {
    UNVERIFIED: 100,
    NOT_LAID: 40,
    PARTIALLY_LAID: 10,
    LAID: 50,
    RETIRED: 0,
  },
  connection: { DISCONNECTED: 160, ORIGIN_ONLY: 15, DESTINATION_ONLY: 5, CONNECTED: 20 },
  tested: 40,
  test: { NOT_TESTED: 157, TESTED_OK: 40, TESTED_FAILED: 3 },
};

const entry: ActivityEntry = {
  id: "e1",
  at: new Date("2026-11-13T10:00:00Z"),
  action: "LAID",
  user: "Juan Pérez",
  userId: "u1",
  cable: { id: "c1", code: "SH-50", deleted: false },
  tray: null,
  from: null,
  to: null,
  summary: "tendió el cable",
  notes: null,
  changes: [],
  detailHref: null,
};

const viewer: DashboardData = {
  progress,
  meters: { planned: 0, laid: 0 },
  myActivityHref: "/activity",
  lastExcel: [],
  toReview: null,
  myActivity: null,
  team: null,
  admin: null,
};

describe("Dashboard", () => {
  it("says up to which Excel the progress goes, and what waits for a decision", () => {
    render(
      <Dashboard
        data={{
          ...viewer,
          lastExcel: [{ kind: "ELECTRICAL", label: "Eléctrico", excelDay: "16/11/2026" }],
          toReview: 3,
        }}
      />,
    );

    expect(screen.getByText("Excel del 16/11/2026")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("3 discrepancias nuevas pendientes");
    expect(screen.getByRole("link", { name: "Revisar" })).toHaveAttribute("href", "/review");
  });

  it("shows the metres laid of the planned ones, leading to «Metros»", () => {
    render(<Dashboard data={{ ...viewer, meters: { planned: 403_900, laid: 169_200 } }} />);

    expect(screen.getByRole("link", { name: "Metros tendidos" })).toHaveAttribute(
      "href",
      "/meters",
    );
    expect(screen.getByText(/169,2 km de 403,9 km/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Metros tendidos" })).toHaveAttribute(
      "aria-valuenow",
      "42",
    );
  });

  it("leads «Tu actividad reciente» straight to the person's activity", () => {
    render(
      <Dashboard data={{ ...viewer, myActivity: [entry], myActivityHref: "/activity?actor=u1" }} />,
    );

    const panel = screen
      .getByRole("heading", { name: "Tu actividad reciente" })
      .closest("section")!;
    expect(within(panel).getByRole("link", { name: "Ver todo" })).toHaveAttribute(
      "href",
      "/activity?actor=u1",
    );
  });

  it("leaves the metres out while the lists bring none", () => {
    render(<Dashboard data={viewer} />);

    expect(screen.queryByText("Metros tendidos")).toBeNull();
  });

  it("shows no notice when nothing waits", () => {
    render(<Dashboard data={{ ...viewer, toReview: 0 }} />);

    expect(screen.queryByRole("link", { name: "Revisar" })).toBeNull();
    expect(screen.queryByText(/Excel del/)).toBeNull();
  });

  it("shows everybody the quick search and the progress of the works", () => {
    render(<Dashboard data={viewer} />);

    // Un solo buscador para todo; sin JavaScript, va a la búsqueda de cables.
    expect(screen.getByRole("search", { name: "Buscar" })).toHaveAttribute("action", "/cables");
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
    expect(screen.getByRole("progressbar", { name: "Timbrados" })).toHaveAttribute(
      "aria-valuenow",
      "20",
    );
    expect(screen.getByRole("link", { name: "3 cables timbrados con fallo" })).toHaveAttribute(
      "href",
      "/cables?test=TESTED_FAILED",
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
            roleNames: {
              ADMIN: "Administrador",
              SUPERVISOR: "Supervisor",
              TECHNICIAN: "Técnico",
              VIEWER: "Consulta",
            },
            database: "ok",
            drawings: { sheets: 3, drawn: 3 },
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
            roleNames: {
              ADMIN: "Administrador",
              SUPERVISOR: "Supervisor",
              TECHNICIAN: "Técnico",
              VIEWER: "Consulta",
            },
            database: "ok",
            drawings: { sheets: 0, drawn: 0 },
          },
        }}
      />,
    );

    expect(screen.queryByRole("link", { name: "Revisar cuentas" })).toBeNull();
    expect(screen.queryByText(/hojas? de los planos/)).toBeNull();
  });

  // Revisión F7.5, A2: desplegado sin las teselas, las fichas salían sin plano y sin aviso.
  it("warns an administrator about drawing sheets loaded without their image", () => {
    const admin = (drawn: number) => ({
      pendingAccounts: 0,
      activeUsers: { ADMIN: 1, SUPERVISOR: 0, TECHNICIAN: 0, VIEWER: 0 },
      roleNames: {
        ADMIN: "Administrador",
        SUPERVISOR: "Supervisor",
        TECHNICIAN: "Técnico",
        VIEWER: "Consulta",
      },
      database: "ok" as const,
      drawings: { sheets: 40, drawn },
    });
    const { rerender } = render(
      <Dashboard data={{ ...viewer, team: { trays: 0, recentActivity: [] }, admin: admin(0) }} />,
    );

    expect(screen.getByText("Ninguna hoja de los planos tiene imagen")).toBeInTheDocument();

    rerender(
      <Dashboard data={{ ...viewer, team: { trays: 0, recentActivity: [] }, admin: admin(37) }} />,
    );
    expect(screen.getByText("3 de 40 hojas de los planos sin imagen")).toBeInTheDocument();
  });
});
