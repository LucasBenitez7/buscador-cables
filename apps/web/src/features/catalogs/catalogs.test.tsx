import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogSection } from "./components/catalog-section";

const mocks = vi.hoisted(() => ({
  createCatalogItemAction: vi.fn(),
  updateCatalogItemAction: vi.fn(),
  deleteCatalogItemAction: vi.fn(),
}));

vi.mock("@/features/catalogs/actions", () => mocks);

const items = [
  { id: "c1", name: "Rojo", hex: "#C0392B", cableCount: 2 },
  { id: "c2", name: "Azul", hex: null, cableCount: 0 },
];

describe("CatalogSection", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
  });

  it("lists the items with their usage and a hex field only for colors", () => {
    const { unmount } = render(<CatalogSection kind="color" items={items} />);

    expect(screen.getByRole("heading", { name: /Colores/ })).toHaveTextContent("(2)");
    expect(screen.getByText("2 cables")).toBeInTheDocument();
    expect(screen.getByLabelText("Color (#RRGGBB)")).toBeInTheDocument();
    unmount();

    render(<CatalogSection kind="manufacturer" items={[]} />);
    expect(screen.queryByLabelText("Color (#RRGGBB)")).toBeNull();
    expect(screen.getByText("Todavía no hay ninguno.")).toBeInTheDocument();
  });

  it("sends the new item and clears the form after success", async () => {
    mocks.createCatalogItemAction.mockResolvedValue({ ok: true, message: '"Verde" añadido.' });
    render(<CatalogSection kind="color" items={items} />);

    fireEvent.change(screen.getByLabelText("Nuevo: color"), { target: { value: "Verde" } });
    fireEvent.change(screen.getByLabelText("Color (#RRGGBB)"), { target: { value: "#27AE60" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));

    await screen.findByText('"Verde" añadido.');
    const formData = mocks.createCatalogItemAction.mock.calls[0]?.[0] as FormData;
    expect(Object.fromEntries(formData)).toEqual({ kind: "color", name: "Verde", hex: "#27AE60" });
    await waitFor(() => expect(screen.getByLabelText("Nuevo: color")).toHaveValue(""));
  });

  it("keeps the typed name when the server rejects it", async () => {
    mocks.createCatalogItemAction.mockResolvedValue({
      ok: false,
      message: "Ya existe un elemento con ese nombre en colores.",
    });
    render(<CatalogSection kind="color" items={items} />);

    fireEvent.change(screen.getByLabelText("Nuevo: color"), { target: { value: "rojo" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir" }));

    await screen.findByText(/Ya existe/);
    expect(screen.getByLabelText("Nuevo: color")).toHaveValue("rojo");
  });

  it("edits an item inline", async () => {
    mocks.updateCatalogItemAction.mockResolvedValue({ ok: true, message: "Guardado." });
    render(<CatalogSection kind="cableType" items={[{ ...items[1]!, name: "Control" }]} />);

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.change(screen.getByLabelText("Nombre de Control"), {
      target: { value: "Control y mando" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await screen.findByText("Guardado.");
    const formData = mocks.updateCatalogItemAction.mock.calls[0]?.[0] as FormData;
    expect(formData.get("id")).toBe("c2");
    expect(formData.get("name")).toBe("Control y mando");
  });
});
