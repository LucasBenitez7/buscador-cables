import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterForm, type FilterField } from "./filter-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const field = (value?: string): FilterField => ({
  kind: "select",
  name: "origin",
  label: "Origen",
  value,
  options: [
    { value: "people", label: "En campo" },
    { value: "all", label: "Todo" },
  ],
});

describe("FilterForm", () => {
  it("resets the fields when the URL values change («Limpiar», back button)", () => {
    const { rerender } = render(
      <FilterForm action="/cables/1" label="Filtrar el historial" fields={[field("all")]} active />,
    );
    expect(screen.getByLabelText("Origen")).toHaveValue("all");

    rerender(<FilterForm action="/cables/1" label="Filtrar el historial" fields={[field()]} />);

    expect(screen.getByLabelText("Origen")).toHaveValue("");
  });

  it("folds all but the first field on a phone, and counts the ones that are set", () => {
    render(
      <FilterForm
        action="/equipment/X"
        label="Filtrar los cables"
        fields={[
          { kind: "text", name: "q", label: "Cable" },
          { ...field("all"), name: "end", label: "Punta aquí" },
          { ...field(), name: "sort", label: "Orden" },
        ]}
      />,
    );
    const more = screen.getByRole("button", { name: "Más filtros (1)" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByLabelText("Punta aquí").parentElement).toHaveClass("max-md:hidden");
    expect(screen.getByLabelText("Cable").parentElement).not.toHaveClass("max-md:hidden");

    fireEvent.click(more);
    expect(screen.getByRole("button", { name: "Menos filtros (1)" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByLabelText("Punta aquí").parentElement).not.toHaveClass("max-md:hidden");
  });

  it("has nothing to fold with a single field", () => {
    render(<FilterForm action="/cables/1" label="Filtrar" fields={[field()]} />);
    expect(screen.queryByRole("button", { name: /Más filtros/ })).toBeNull();
  });
});
