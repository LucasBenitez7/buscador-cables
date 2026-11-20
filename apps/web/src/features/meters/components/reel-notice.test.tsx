import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReelNotice } from "./reel-notice";

describe("ReelNotice", () => {
  it("says which reel the list shows, with a way back to the reels and out of the filter", () => {
    render(<ReelNotice reel="B-101" status="En obra" clearHref="/cables?level=L2" />);

    expect(screen.getByRole("status")).toHaveTextContent("Cables de la bobina B-101 · En obra");
    expect(screen.getByRole("link", { name: "Ver todas las bobinas" })).toHaveAttribute(
      "href",
      "/meters?tab=bobinas",
    );
    expect(screen.getByRole("link", { name: "Quitar filtro" })).toHaveAttribute(
      "href",
      "/cables?level=L2",
    );
  });

  it("leaves the state out when the Excel brings none", () => {
    render(<ReelNotice reel="B-101" status={null} clearHref="/cables" />);

    expect(screen.getByRole("status")).toHaveTextContent("Cables de la bobina B-101");
    expect(screen.getByRole("status")).not.toHaveTextContent("·");
  });
});
