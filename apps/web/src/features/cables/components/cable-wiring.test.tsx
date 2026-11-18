import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WireRow } from "@cables/shared";
import { CableWiring } from "./cable-wiring";

vi.mock("@/features/cables/wiring-actions", () => ({ editWiringAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

// Datos inventados: un cable de dos hilos, tal y como viene en el listado.
const wire = (position: number, name: string, point: string): WireRow => ({
  position,
  wire: name,
  colour: null,
  originBlock: "X1",
  originPoint: point,
  destinationBlock: "X9",
  destinationPoint: point,
  pdfOriginBlock: "X1",
  pdfOriginPoint: point,
  pdfDestinationBlock: "X9",
  pdfDestinationPoint: point,
});
const wires = [wire(1, "BN", "1"), wire(2, "BK", "2")];

function renderWiring() {
  render(<CableWiring cableId="c1" version={1} wires={wires} jumpers={[]} canEdit />);
}

const originPointOfBN = () => screen.getByRole("textbox", { name: /borna.*origen.*BN/i });

describe("CableWiring", () => {
  // Bug: al cancelar, lo escrito seguía a la vista como si se hubiera guardado.
  it.each([
    ["Cancelar", () => fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))],
    ["el interruptor", () => fireEvent.click(screen.getByRole("switch", { name: "Modo editar" }))],
  ])("al salir con %s, la tabla vuelve a lo guardado", (_, leave) => {
    renderWiring();
    fireEvent.click(screen.getByRole("switch", { name: "Modo editar" }));
    fireEvent.change(originPointOfBN(), { target: { value: "7" } });

    leave();

    expect(screen.queryByText("7")).toBeNull();
    expect(screen.queryByText(/Listado:/)).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();

    // Al volver a editar, la casilla tampoco trae lo que no se guardó.
    fireEvent.click(screen.getByRole("switch", { name: "Modo editar" }));
    expect(originPointOfBN()).toHaveProperty("value", "1");
  });
});
