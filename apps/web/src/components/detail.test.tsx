import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Item, Section } from "./detail";

describe("Section", () => {
  it("puts its action next to the title, before the content", () => {
    render(
      <Section
        title="Cables que pasan por aquí (3)"
        action={<button type="button">Ver en el buscador</button>}
      >
        <ul>
          <li>SH-50</li>
        </ul>
      </Section>,
    );

    const action = screen.getByRole("button", { name: "Ver en el buscador" });
    const content = screen.getByText("SH-50");
    expect(screen.getByRole("heading", { name: /Cables que pasan/ })).toBeInTheDocument();
    expect(action.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("Item", () => {
  it("shows the value, or a dash when there is none", () => {
    render(
      <dl>
        <Item label="Longitud">113 m</Item>
        <Item label="Color">{null}</Item>
        <Item label="Conductores">{0}</Item>
      </dl>,
    );

    expect(screen.getByText("113 m")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
