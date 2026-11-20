import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeviationBadge } from "./deviation-badge";

describe("DeviationBadge", () => {
  it("says the percent in the colour of how serious it is, and the metres on demand", () => {
    render(<DeviationBadge planned={100} actual={140} withMetres />);

    const badge = screen.getByText("+40 %");
    expect(badge.closest("[data-slot=badge]") ?? badge).toHaveAttribute("title", "Revisar: +40 m");
    expect(screen.getByText("+40 m · revisar")).toBeInTheDocument();
  });

  it("keeps quiet without both lengths", () => {
    render(<DeviationBadge planned={null} actual={140} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
