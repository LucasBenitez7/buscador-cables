import { render, screen } from "@testing-library/react";
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
  it("resets the fields when the URL values change («Quitar filtros», back button)", () => {
    const { rerender } = render(
      <FilterForm action="/cables/1" label="Filtrar el historial" fields={[field("all")]} active />,
    );
    expect(screen.getByLabelText("Origen")).toHaveValue("all");

    rerender(<FilterForm action="/cables/1" label="Filtrar el historial" fields={[field()]} />);

    expect(screen.getByLabelText("Origen")).toHaveValue("");
  });
});
