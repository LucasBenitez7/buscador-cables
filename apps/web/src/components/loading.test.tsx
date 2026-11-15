import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLoader, ListSkeleton, PageSkeleton } from "./loading";

describe("loading states", () => {
  it("announces the load once, with the logo and a ring that does not move for reduced motion", () => {
    render(<BrandLoader label="Cargando el plano…" />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Cargando el plano…");
    expect(status.querySelector("svg")).not.toBeNull();
    expect(status.innerHTML).toContain("motion-safe:animate-spin");
  });

  it("draws translucent boxes that screen readers skip", () => {
    const { container } = render(
      <PageSkeleton>
        <ListSkeleton rows={3} />
      </PageSkeleton>,
    );

    const boxes = container.querySelectorAll("[aria-hidden='true'].bg-muted\\/50");
    expect(boxes.length).toBeGreaterThanOrEqual(5);
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});
