import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShowMore } from "./show-more";

const items = (count: number) =>
  Array.from({ length: count }, (_, i) => <li key={i}>Cable {i + 1}</li>);

describe("ShowMore", () => {
  it("shows a short list whole, without a button", () => {
    render(<ShowMore items={items(12)} noun="cables" />);

    expect(screen.getAllByRole("listitem")).toHaveLength(12);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("cuts a long list to its first items and shows them all, and fewer again", () => {
    render(<ShowMore as="ol" label="Tramos" items={items(34)} noun="cables" />);

    expect(screen.getByRole("list", { name: "Tramos" }).tagName).toBe("OL");
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "Ver los 34 cables (faltan 24)" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(34);
    fireEvent.click(screen.getByRole("button", { name: "Ver menos" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
  });
});
