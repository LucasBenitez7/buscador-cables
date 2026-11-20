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

  it("sends to the whole list when it brought only the first ones, with the real number", () => {
    // Una ubicación con 315 cables trae los 25 primeros: el botón no puede decir «Ver los 25».
    render(
      <ShowMore
        items={items(25)}
        noun="cables"
        more={{ total: 315, href: "/cables?location=u1" }}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.queryByRole("button")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Ver los 315 cables en el buscador →" }),
    ).toHaveAttribute("href", "/cables?location=u1");
  });

  it("works as usual when it brought them all", () => {
    render(<ShowMore items={items(17)} noun="cables" more={{ total: 17, href: "/cables" }} />);

    expect(screen.getByRole("button", { name: "Ver los 17 cables (faltan 7)" })).toBeTruthy();
  });
});
