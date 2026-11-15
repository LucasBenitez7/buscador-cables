import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LocationNode } from "@cables/shared";
import type { LocationWithCounts } from "@/server/locations/service";
import { LocationTree } from "./location-tree";

vi.mock("@/features/locations/actions", () => ({
  createLocationAction: vi.fn(),
  updateLocationAction: vi.fn(),
  deleteLocationAction: vi.fn(),
  moveLocationAction: vi.fn(),
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
    // El recuento abre el buscador filtrado por esa ubicación (y lo que contiene).
    expect(screen.getByRole("link", { name: "3 cables →" })).toHaveAttribute(
      "href",
      "/cables?location=a",
    );
    // Sin cables, no hay enlace.
    expect(screen.queryByText(/0 cables/)).toBeNull();
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

describe("LocationForm", () => {
  // Regresión: React 19 vaciaba los campos tras una respuesta de error del servidor.
  it("keeps what the user typed when the server rejects it", async () => {
    const { createLocationAction } = await import("@/features/locations/actions");
    vi.mocked(createLocationAction).mockResolvedValue({
      ok: false,
      message: "Ya existe una ubicación con ese código.",
    });
    render(<LocationTree tree={[]} canManage />);
    fireEvent.click(screen.getByRole("button", { name: "Nueva planta" }));

    fireEvent.change(screen.getByLabelText("Nombre (planta)"), { target: { value: "Planta Sur" } });
    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "PS" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear" }));

    await screen.findByText("Ya existe una ubicación con ese código.");
    expect(screen.getByLabelText("Nombre (planta)")).toHaveValue("Planta Sur");
    expect(screen.getByLabelText("Código")).toHaveValue("PS");
  });
});

describe("moving a location", () => {
  it("offers only valid destinations and sends the chosen one", async () => {
    const { moveLocationAction } = await import("@/features/locations/actions");
    vi.mocked(moveLocationAction).mockResolvedValue({ ok: true, message: "Ubicación movida." });
    const withSecondArea = [
      {
        ...tree[0]!,
        children: [
          ...tree[0]!.children,
          node({ id: "a2", name: "Turbinas", code: "A-TUR", type: "AREA", parentId: "p" }),
        ],
      },
    ];
    render(<LocationTree tree={withSecondArea} canManage />);

    expect(screen.getAllByRole("button", { name: /^Mover .+/ })).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Mover Reactor X" }));
    const select = screen.getByLabelText('Mover "Reactor X" a otra área');
    expect(
      Array.from((select as HTMLSelectElement).options)
        .filter((option) => !option.disabled)
        .map((option) => option.textContent),
    ).toEqual(["Planta Norte › Turbinas"]);

    fireEvent.change(select, { target: { value: "a2" } });
    fireEvent.click(screen.getByRole("button", { name: "Mover" }));

    await waitFor(() => expect(moveLocationAction).toHaveBeenCalled());
    const formData = vi.mocked(moveLocationAction).mock.calls[0]?.[0] as FormData;
    expect(Object.fromEntries(formData)).toEqual({ id: "u", parentId: "a2" });
  });

  it("does not offer to move plants", () => {
    render(
      <LocationTree tree={[node({ id: "p", name: "Sola", code: "S", type: "PLANT" })]} canManage />,
    );

    expect(screen.queryByRole("button", { name: /^Mover/ })).toBeNull();
  });
});
