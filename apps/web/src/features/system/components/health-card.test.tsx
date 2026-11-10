import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HealthCard } from "./health-card";

describe("HealthCard", () => {
  it("shows a connected database", () => {
    render(<HealthCard database="ok" />);

    const status = screen.getByTestId("health-database");
    expect(status).toHaveTextContent("Conectada");
    expect(status).toHaveAttribute("data-status", "ok");
  });

  it("shows a disconnected database", () => {
    render(<HealthCard database="error" />);

    const status = screen.getByTestId("health-database");
    expect(status).toHaveTextContent("Sin conexión");
    expect(status).toHaveAttribute("data-status", "error");
  });
});
