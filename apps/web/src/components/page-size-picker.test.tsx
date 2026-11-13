import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageSizePicker } from "./page-size-picker";

const href = (size: number, page: number) => `/cables?page=${page}&size=${size}`;

describe("PageSizePicker", () => {
  it("offers every size and marks the default one when the URL has none", () => {
    render(<PageSizePicker sizes={[25, 50, 100]} page={1} href={href} />);
    const nav = screen.getByRole("navigation", { name: "Resultados por página" });
    expect(nav).toHaveTextContent("Por página");
    expect(screen.getByRole("link", { name: "25" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "100" })).not.toHaveAttribute("aria-current");
  });

  it("recomputes the page so the same cables stay in view", () => {
    // Página 3 de 25 (desde el cable 51): con 50 por página es la 2; con 100, la 1.
    render(<PageSizePicker sizes={[25, 50, 100]} size={25} page={3} href={href} />);
    expect(screen.getByRole("link", { name: "50" })).toHaveAttribute(
      "href",
      "/cables?page=2&size=50",
    );
    expect(screen.getByRole("link", { name: "100" })).toHaveAttribute(
      "href",
      "/cables?page=1&size=100",
    );
  });

  it("marks the size in the URL", () => {
    render(<PageSizePicker sizes={[25, 50, 100]} size={100} page={1} href={href} />);
    expect(screen.getByRole("link", { name: "100" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "25" })).not.toHaveAttribute("aria-current");
  });
});
