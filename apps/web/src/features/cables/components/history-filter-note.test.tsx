import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HistoryFilterNote } from "./history-filter-note";

describe("HistoryFilterNote", () => {
  it("says nothing without filters, and never mentions hidden load entries", () => {
    const { container } = render(
      <HistoryFilterNote search={{ sort: "newest" }} total={3} all={9} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/ocultas?/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ver todo" })).not.toBeInTheDocument();
  });

  it("treats the default origin (people) as no filter", () => {
    const { container } = render(
      <HistoryFilterNote search={{ origin: "people", sort: "oldest" }} total={3} all={9} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("says nothing when the cable has no history at all", () => {
    const { container } = render(
      <HistoryFilterNote search={{ origin: "all" }} total={0} all={0} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("counts the matches once a filter is set", () => {
    const { rerender } = render(<HistoryFilterNote search={{ origin: "all" }} total={9} all={9} />);
    expect(screen.getByRole("status")).toHaveTextContent("9 de 9 movimientos cumplen los filtros.");

    rerender(<HistoryFilterNote search={{ action: "CONNECTED" }} total={2} all={9} />);
    expect(screen.getByRole("status")).toHaveTextContent("2 de 9 movimientos cumplen los filtros.");

    rerender(<HistoryFilterNote search={{ person: "juan" }} total={1} all={9} />);
    expect(screen.getByRole("status")).toHaveTextContent("1 de 9 movimientos cumplen los filtros.");
  });
});
