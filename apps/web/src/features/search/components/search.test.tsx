import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CableSearchResult, SearchOptions } from "@/server/cables/search";
import { SearchFilters } from "./search-filters";
import { SearchResults } from "./search-results";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const options: SearchOptions = {
  cableTypes: [{ id: "t1", label: "Control" }],
  colors: [{ id: "c1", label: "Gris" }],
  manufacturers: [{ id: "m1", label: "Prysmian" }],
  locations: [
    { id: "p", label: "Norte", type: "PLANT" },
    { id: "a", label: "Norte › Calderas", type: "AREA" },
  ],
  users: [{ id: "u1", label: "Juan Pérez" }],
};

describe("SearchFilters", () => {
  beforeEach(() => push.mockReset());

  it("navigates to a clean, shareable URL keeping the current order", () => {
    render(<SearchFilters search={{ sort: "length", dir: "desc", page: 4 }} options={options} />);

    fireEvent.change(screen.getByLabelText("Código o descripción"), { target: { value: "sh50" } });
    fireEvent.change(screen.getByLabelText("Ubicación (incluye lo que contiene)"), {
      target: { value: "a" },
    });
    fireEvent.change(screen.getByLabelText("Longitud (m): desde"), { target: { value: "2,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));

    // Sin campos vacíos y volviendo a la página 1.
    expect(push).toHaveBeenCalledWith(
      "/cables?q=sh50&location=a&lengthMin=2.5&sort=length&dir=desc",
    );
  });

  it("shows the current filters and opens 'Más filtros' when one of them is active", () => {
    render(<SearchFilters search={{ q: "SH", color: "c1", sectionMin: 2.5 }} options={options} />);

    expect(screen.getByLabelText("Código o descripción")).toHaveValue("SH");
    expect(screen.getByLabelText("Sección (mm²): desde")).toHaveValue("2,5");
    expect(screen.getByText("Más filtros").closest("details")).toHaveAttribute("open");
  });

  it("filters by who did what and when", () => {
    render(<SearchFilters search={{}} options={options} />);

    fireEvent.change(screen.getByLabelText("Quién"), { target: { value: "u1" } });
    fireEvent.change(screen.getByLabelText("Qué hizo"), { target: { value: "CONNECTED" } });
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));

    expect(push).toHaveBeenCalledWith("/cables?actor=u1&action=CONNECTED&from=2026-11-01");
  });

  it("opens 'Más filtros' when a who / what / when filter is active", () => {
    render(<SearchFilters search={{ action: "MOVED" }} options={options} />);

    expect(screen.getByText("Más filtros").closest("details")).toHaveAttribute("open");
    expect(screen.getByLabelText("Qué hizo")).toHaveValue("MOVED");
  });

  it("clears every filter", () => {
    render(<SearchFilters search={{ q: "SH" }} options={options} />);

    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));

    expect(push).toHaveBeenCalledWith("/cables");
  });
});

const item = {
  id: "c1",
  code: "SH-50",
  version: 2,
  state: {
    installationStatus: "LAID",
    connectionStatus: "CONNECTED",
    currentLocationId: null,
    originId: "o",
    destinationId: "d",
    deleted: false,
  },
  description: null,
  type: "Control",
  color: { name: "Gris", hex: "#8E9196" },
  conductors: 3,
  crossSectionMm2: 2.5,
  lengthM: 120.5,
  installationStatus: "LAID",
  connectionStatus: "CONNECTED",
  origin: "Caldera 1 › Bandeja norte",
  destination: "Caldera 2 › Armario local",
  lastAction: "UPDATED",
  lastActionAt: new Date("2026-11-11T09:30:00Z"),
  lastActionBy: "Tomás",
} satisfies CableSearchResult["items"][number];

describe("SearchResults", () => {
  it("shows an empty state", () => {
    render(<SearchResults search={{}} result={{ items: [], total: 0, page: 1, pageCount: 0 }} />);

    expect(screen.getByText("No hay cables que cumplan estos filtros.")).toBeInTheDocument();
  });

  // La tabla (tablet y escritorio) y las tarjetas (móvil) están en el DOM; el CSS elige una.
  it("links each code to its record and shows readable values in the table", () => {
    render(
      <SearchResults search={{}} result={{ items: [item], total: 1, page: 1, pageCount: 1 }} />,
    );
    const table = within(screen.getByRole("table"));

    expect(table.getByRole("link", { name: "SH-50" })).toHaveAttribute("href", "/cables/c1");
    expect(table.getByText("3×2,5 mm²")).toBeInTheDocument();
    expect(table.getByText("120,5 m")).toBeInTheDocument();
    expect(table.getByText(/Tomás · 11\/11\/26, 10:30/)).toBeInTheDocument();
  });

  it("shows each cable as a card for phones", () => {
    render(
      <SearchResults search={{}} result={{ items: [item], total: 1, page: 1, pageCount: 1 }} />,
    );
    const card = within(screen.getByRole("listitem"));

    expect(card.getByRole("link", { name: "SH-50" })).toHaveAttribute("href", "/cables/c1");
    expect(card.getByText("Control · 3×2,5 mm² · 120,5 m")).toBeInTheDocument();
    expect(
      card.getByText("Caldera 1 › Bandeja norte → Caldera 2 › Armario local"),
    ).toBeInTheDocument();
    expect(card.getByText("Datos editados")).toBeInTheDocument();
  });

  it("marks the sorted column and toggles its direction", () => {
    render(
      <SearchResults
        search={{ q: "sh", sort: "length", dir: "asc" }}
        result={{ items: [item], total: 1, page: 1, pageCount: 1 }}
      />,
    );

    const length = screen.getByRole("columnheader", { name: /Longitud/ });
    expect(length).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getByRole("link", { name: /Longitud/ })).toHaveAttribute(
      "href",
      "/cables?q=sh&sort=length&dir=desc",
    );
  });

  it("paginates with links that keep the filters", () => {
    render(
      <SearchResults
        search={{ type: "t1", page: 2 }}
        result={{ items: [item], total: 60, page: 2, pageCount: 3 }}
      />,
    );

    expect(screen.getByRole("link", { name: "← Anterior" })).toHaveAttribute(
      "href",
      "/cables?type=t1",
    );
    expect(screen.getByRole("link", { name: "Siguiente →" })).toHaveAttribute(
      "href",
      "/cables?type=t1&page=3",
    );
    expect(screen.getByRole("status")).toHaveTextContent("60 cables · página 2 de 3");
  });

  it("shows the status as coloured badges", () => {
    render(
      <SearchResults search={{}} result={{ items: [item], total: 1, page: 1, pageCount: 1 }} />,
    );

    expect(within(screen.getByRole("table")).getByText("Conectado")).toHaveClass("text-success");
  });

  it("adds an action button per row only when the role can act", () => {
    const result = { items: [item], total: 1, page: 1, pageCount: 1 };
    const { rerender } = render(<SearchResults search={{}} result={result} />);
    expect(screen.queryByRole("button", { name: "Acción" })).toBeNull();

    rerender(
      <SearchResults search={{}} result={result} actions={{ role: "TECHNICIAN", locations: [] }} />,
    );
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: "Acción" }));

    // Picker with what a technician can do on a laid, connected cable (no corrections here).
    expect(screen.getByRole("button", { name: "Desconectar" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Conectar" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Corregir" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Desconectar" }));
    expect(screen.getByRole("heading", { name: /Desconectar · SH-50/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "← Otra acción" })).toBeInTheDocument();
  });

  it("warns when it shows similar codes instead of matches", () => {
    render(
      <SearchResults
        search={{ q: "shh50" }}
        result={{ items: [item], total: 1, page: 1, pageCount: 1, fuzzy: true }}
      />,
    );

    expect(screen.getByText(/Ningún código contiene «shh50»/)).toBeInTheDocument();
  });
});
