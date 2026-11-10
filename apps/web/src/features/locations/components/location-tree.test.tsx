import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LocationNode } from "@cables/shared";
import type { LocationWithCounts } from "@/server/locations/service";
import { LocationTree } from "./location-tree";

vi.mock("@/features/locations/actions", () => ({
  createLocationAction: vi.fn(),
  updateLocationAction: vi.fn(),
  deleteLocationAction: vi.fn(),
}));

function node(
  overrides: Partial<LocationNode<LocationWithCounts>> &
    Pick<LocationNode<LocationWithCounts>, "id" | "name" | "code" | "type">,
): LocationNode<LocationWithCounts> {
  return { parentId: null, path: `/${overrides.code}`, cableCount: 0, children: [], ...overrides };
}

const tree = [
  node({
    id: "p",
    name: "Planta Norte",
    code: "PN",
    type: "PLANT",
    children: [
      node({
        id: "a",
        name: "Área de calderas",
        code: "A-CAL",
        type: "AREA",
        parentId: "p",
        cableCount: 3,
        children: [node({ id: "u", name: "Reactor X", code: "R-X", type: "UNIT", parentId: "a" })],
      }),
    ],
  }),
];

describe("LocationTree", () => {
  it("shows the tree read-only for users without location:manage", () => {
    render(<LocationTree tree={tree} canManage={false} />);

    expect(screen.getByText("Planta Norte")).toBeInTheDocument();
    expect(screen.getByText("Reactor X")).toBeInTheDocument();
    expect(screen.getByText("3 cables")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar|Eliminar|Nueva planta/ })).toBeNull();
  });

  it("offers to add the next level of the hierarchy", () => {
    render(<LocationTree tree={tree} canManage />);

    expect(screen.getByRole("button", { name: "Añadir área" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Añadir unidad" }));

    expect(screen.getByLabelText("Nombre (unidad)")).toBeInTheDocument();
  });

  it("collapses and expands a branch", () => {
    render(<LocationTree tree={tree} canManage={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Contraer Área de calderas" }));

    expect(screen.queryByText("Reactor X")).toBeNull();
  });

  it("shows an empty state", () => {
    render(<LocationTree tree={[]} canManage />);

    expect(screen.getByText("Todavía no hay ubicaciones.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva planta" })).toBeInTheDocument();
  });
});
