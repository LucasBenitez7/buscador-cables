import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataList, Item, JumpLinks, Section } from "./detail";

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
  it("shows the name and the value, and leaves out the empty ones", () => {
    render(
      <DataList title="Qué es">
        <Item label="Longitud">113 m</Item>
        <Item label="Color">{null}</Item>
        <Item label="Conductores">{0}</Item>
      </DataList>,
    );

    expect(screen.getByRole("heading", { name: "Qué es" })).toBeInTheDocument();
    expect(screen.getByText("Longitud").nextSibling).toHaveTextContent("113 m");
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByText("Color")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
  });
});

describe("Section: collapsible and jump links", () => {
  it("folds with its title and starts open", () => {
    const { container } = render(
      <Section title="Tabla de hilos" collapsible id="hilos">
        <p>BN · X51 · 11</p>
      </Section>,
    );
    const details = container.querySelector("details#hilos") as HTMLDetailsElement;

    expect(details.open).toBe(true);
    fireEvent.click(screen.getByText("Tabla de hilos"));
    expect(details.open).toBe(false);
  });

  it("opens a folded section when a jump link points to it", () => {
    window.location.hash = "#hoja";
    const { container } = render(
      <Section title="Hoja original" collapsible defaultOpen={false} id="hoja">
        <p>Imagen</p>
      </Section>,
    );

    expect((container.querySelector("details#hoja") as HTMLDetailsElement).open).toBe(true);
    window.location.hash = "";
  });

  it("links to the sections of the page", () => {
    render(
      <JumpLinks
        links={[
          { id: "hilos", label: "Tabla de hilos" },
          { id: "hoja", label: "Hoja original" },
        ]}
      />,
    );

    const nav = screen.getByRole("navigation", { name: "Ir a" });
    expect(within(nav).getByRole("link", { name: "Hoja original" })).toHaveAttribute(
      "href",
      "#hoja",
    );
  });
});
