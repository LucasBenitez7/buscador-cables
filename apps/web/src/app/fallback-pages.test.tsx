import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ErrorPage from "./error";
import NotFound from "./not-found";

describe("NotFound", () => {
  it("explains the page does not exist and links home", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading", { name: "Página no encontrada" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
  });
});

describe("ErrorPage", () => {
  it("retries without exposing the error message", () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error("relation cable does not exist")} reset={reset} />);

    expect(screen.queryByText(/relation cable/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
