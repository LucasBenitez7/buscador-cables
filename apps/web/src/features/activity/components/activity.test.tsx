import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityPage } from "@/server/activity/service";
import { ActivityFilters } from "./activity-filters";
import { ActivityList } from "./activity-list";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const activity: ActivityPage = {
  entries: [
    {
      id: "e1",
      at: new Date("2026-11-10T22:30:00Z"),
      action: "MOVED",
      user: "Juan Pérez",
      cable: { id: "c1", code: "SH-50", deleted: false },
      summary: "movió el cable de Almacén a Patio",
      notes: "Para la parada",
      changes: [{ field: "Ubicación actual", from: "Almacén", to: "Patio" }],
    },
    {
      id: "e2",
      at: new Date("2026-11-09T08:00:00Z"),
      action: "RETIRED",
      user: "Ana Ruiz",
      cable: { id: "c2", code: "PW-1", deleted: true },
      summary: "retiró el cable",
      notes: null,
      changes: [],
    },
  ],
  total: 120,
  page: 2,
  pageCount: 3,
};

describe("ActivityList", () => {
  it("reads like a timeline with who, what, the cable and the note", () => {
    render(<ActivityList basePath="/activity" search={{ action: "MOVED" }} activity={activity} />);

    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText(/movió el cable de Almacén a Patio/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "SH-50" })).toHaveAttribute("href", "/cables/c1");
    expect(screen.getByText(/10\/11\/26, 23:30/)).toBeInTheDocument();
    expect(screen.getByText("“Para la parada”")).toBeInTheDocument();
    expect(screen.getByText(/\(dado de baja\)/)).toBeInTheDocument();
  });

  it("paginates keeping the filters", () => {
    render(<ActivityList basePath="/activity" search={{ action: "MOVED" }} activity={activity} />);

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
      <ActivityList basePath="/activity/me" search={{}} activity={activity} showUser={false} />,
    );

    expect(screen.queryByText("Juan Pérez")).toBeNull();
    expect(screen.getByText("Movió el cable de Almacén a Patio.")).toBeInTheDocument();
  });

  it("shows an empty state", () => {
    render(
      <ActivityList
        basePath="/activity"
        search={{}}
        activity={{ entries: [], total: 0, page: 1, pageCount: 0 }}
      />,
    );

    expect(screen.getByText("No hay movimientos que cumplan estos filtros.")).toBeInTheDocument();
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
