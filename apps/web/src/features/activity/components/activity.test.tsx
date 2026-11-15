import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityPage } from "@/server/activity/service";
import { ActivityFilters } from "./activity-filters";
import { ActivityList, actionVariant } from "./activity-list";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const activity: ActivityPage = {
  entries: [
    {
      id: "e1",
      at: new Date("2026-11-10T22:30:00Z"),
      action: "MOVED",
      user: "Juan Pérez",
      userId: "u-juan",
      cable: { id: "c1", code: "SH-50", deleted: false },
      tray: null,
      from: { id: "l-alm", name: "Almacén" },
      to: { id: "l-pat", name: "Patio" },
      summary: "movió el cable de Almacén a Patio",
      notes: "Para la parada",
      changes: [
        {
          field: "Ubicación actual",
          from: "Almacén",
          to: "Patio",
          fromHref: "/cables?location=l-alm",
          toHref: "/cables?location=l-pat",
        },
      ],
    },
    {
      id: "e3",
      at: new Date("2026-11-10T21:00:00Z"),
      action: "PARTIALLY_LAID",
      user: "Juan Pérez",
      userId: "u-juan",
      cable: { id: "c3", code: "SH-51", deleted: false },
      tray: "99UXA00L22036",
      from: null,
      to: null,
      summary: "tendió el cable a medias: la punta de destino espera en la bandeja 99UXA00L22036",
      notes: null,
      changes: [],
    },
    {
      id: "e2",
      at: new Date("2026-11-09T08:00:00Z"),
      action: "RETIRED",
      user: "Ana Ruiz",
      userId: "u-ana",
      cable: { id: "c2", code: "PW-1", deleted: true },
      tray: null,
      from: null,
      to: null,
      summary: "retiró el cable",
      notes: null,
      changes: [],
    },
  ],
  total: 120,
  page: 2,
  pageCount: 3,
};

// 23:30 del 10 de noviembre en Madrid: "hoy" en estos tests.
const today = "2026-11-10";

describe("ActivityList", () => {
  it("reads like a timeline with who, what, the cable and the note", () => {
    render(
      <ActivityList
        basePath="/activity"
        search={{ action: "MOVED" }}
        activity={activity}
        today={today}
      />,
    );

    expect(screen.getByRole("link", { name: "SH-50" })).toHaveAttribute("href", "/cables/c1");
    expect(screen.getByText("23:30")).toBeInTheDocument();
    expect(screen.getByText("“Para la parada”")).toBeInTheDocument();
    expect(screen.getByText(/\(dado de baja\)/)).toBeInTheDocument();
    expect(screen.getByText("Movido")).toBeInTheDocument();
  });

  it("groups the movements by day", () => {
    render(<ActivityList basePath="/activity" search={{}} activity={activity} today={today} />);

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "Hoy · martes, 10 de noviembre de 2026",
      "Ayer · lunes, 9 de noviembre de 2026",
    ]);
  });

  it("links the person, the places and the tray of each movement", () => {
    render(<ActivityList basePath="/activity" search={{}} activity={activity} today={today} />);

    expect(screen.getAllByRole("link", { name: "Juan Pérez" })[0]).toHaveAttribute(
      "href",
      "/activity?actor=u-juan",
    );
    // En la frase y en la tabla de cambios.
    expect(screen.getAllByRole("link", { name: "Patio" })[0]).toHaveAttribute(
      "href",
      "/cables?location=l-pat",
    );
    expect(screen.getByRole("link", { name: "99UXA00L22036" })).toHaveAttribute(
      "href",
      "/trays/99UXA00L22036",
    );
  });

  it("offers today and the last seven days, keeping the other filters", () => {
    render(
      <ActivityList
        basePath="/activity"
        search={{ action: "MOVED" }}
        activity={activity}
        today={today}
      />,
    );

    const ranges = screen.getByRole("navigation", { name: "Periodo" });
    expect(within(ranges).getByRole("link", { name: "Todo" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(within(ranges).getByRole("link", { name: "Hoy" })).toHaveAttribute(
      "href",
      "/activity?action=MOVED&from=2026-11-10",
    );
    expect(within(ranges).getByRole("link", { name: "Últimos 7 días" })).toHaveAttribute(
      "href",
      "/activity?action=MOVED&from=2026-11-04",
    );
  });

  it("paginates keeping the filters", () => {
    render(
      <ActivityList
        basePath="/activity"
        search={{ action: "MOVED" }}
        activity={activity}
        today={today}
      />,
    );

    expect(screen.getByRole("link", { name: "← Más recientes" })).toHaveAttribute(
      "href",
      "/activity?action=MOVED",
    );
    expect(screen.getByRole("link", { name: "Más antiguos →" })).toHaveAttribute(
      "href",
      "/activity?action=MOVED&page=3",
    );
  });

  it("hides the name on Mi actividad and starts the sentence with a capital", () => {
    render(
      <ActivityList
        basePath="/activity/me"
        search={{}}
        activity={activity}
        showUser={false}
        today={today}
      />,
    );

    expect(screen.queryByRole("link", { name: "Juan Pérez" })).toBeNull();
    expect(screen.getByText(/^Movió el cable de/)).toBeInTheDocument();
  });

  it("colours a failed timbrado as a fault", () => {
    expect(
      actionVariant({
        action: "TESTED",
        changes: [{ field: "Timbrado", from: "Sin timbrar", to: "Timbrado con fallo" }],
      }),
    ).toBe("destructive");
    expect(
      actionVariant({
        action: "TESTED",
        changes: [{ field: "Timbrado", from: "Sin timbrar", to: "Timbrado" }],
      }),
    ).toBe("success");
  });

  it("shows an empty state, still with the periods", () => {
    render(
      <ActivityList
        basePath="/activity"
        search={{}}
        activity={{ entries: [], total: 0, page: 1, pageCount: 0 }}
        today={today}
      />,
    );

    expect(screen.getByText("No hay movimientos que cumplan estos filtros.")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Periodo" })).toBeInTheDocument();
  });
});

describe("ActivityFilters", () => {
  beforeEach(() => push.mockReset());

  it("filters by person, action and dates with a clean URL", () => {
    render(
      <ActivityFilters basePath="/activity" search={{}} users={[{ id: "u1", label: "Juan" }]} />,
    );

    fireEvent.change(screen.getByLabelText("Quién"), { target: { value: "u1" } });
    fireEvent.change(screen.getByLabelText("Qué hizo"), { target: { value: "CONNECTED" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-11-12" } });
    fireEvent.click(screen.getByRole("button", { name: "Filtrar" }));

    expect(push).toHaveBeenCalledWith("/activity?actor=u1&action=CONNECTED&to=2026-11-12");
  });

  it("has no person filter on Mi actividad", () => {
    render(<ActivityFilters basePath="/activity/me" search={{ action: "LAID" }} />);

    expect(screen.queryByLabelText("Quién")).toBeNull();
    expect(screen.getByLabelText("Qué hizo")).toHaveValue("LAID");
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(push).toHaveBeenCalledWith("/activity/me");
  });
});
