import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pagination } from "./pagination";

const href = (page: number) => `/trays?page=${page}`;

describe("Pagination", () => {
  it("renders nothing when everything fits on one page", () => {
    const { container } = render(<Pagination page={1} pageCount={1} href={href} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the current page and links to the neighbours", () => {
    render(<Pagination page={2} pageCount={179} href={href} />);
    const nav = screen.getByRole("navigation", { name: "Paginación" });
    expect(nav).toHaveTextContent("Página 2 de 179");
    expect(screen.getByRole("link", { name: "← Anterior" })).toHaveAttribute(
      "href",
      "/trays?page=1",
    );
    expect(screen.getByRole("link", { name: "Siguiente →" })).toHaveAttribute(
      "href",
      "/trays?page=3",
    );
  });

  it("hides the previous link on the first page and the next one on the last", () => {
    const { rerender } = render(<Pagination page={1} pageCount={3} href={href} />);
    expect(screen.queryByRole("link", { name: "← Anterior" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation")).toHaveTextContent("Página 1 de 3");

    rerender(<Pagination page={3} pageCount={3} href={href} />);
    expect(screen.queryByRole("link", { name: "Siguiente →" })).not.toBeInTheDocument();
  });

  it("accepts its own labels", () => {
    render(
      <Pagination
        page={2}
        pageCount={3}
        href={href}
        previousLabel="← Más recientes"
        nextLabel="Más antiguos →"
      />,
    );
    expect(screen.getByRole("link", { name: "← Más recientes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Más antiguos →" })).toBeInTheDocument();
  });
});
