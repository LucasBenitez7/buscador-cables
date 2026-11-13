import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CableForEdit, CableFormOptions } from "@/server/cables/service";
import { CableForm } from "./cable-form";
import { DeleteCableForm } from "./delete-cable-form";

const mocks = vi.hoisted(() => ({
  createCableAction: vi.fn(),
  updateCableAction: vi.fn(),
  deleteCableAction: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/features/cables/actions", () => ({
  createCableAction: mocks.createCableAction,
  updateCableAction: mocks.updateCableAction,
  deleteCableAction: mocks.deleteCableAction,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

const options: CableFormOptions = {
  cableTypes: [{ id: "t1", label: "Control" }],
  colors: [{ id: "c1", label: "Gris" }],
  manufacturers: [{ id: "m1", label: "Prysmian" }],
  locations: [
    { id: "s1", label: "Norte › Calderas › Sitio 1", type: "SITE" },
    { id: "s2", label: "Norte › Calderas › Sitio 2", type: "SITE" },
    { id: "alm", label: "Norte › Logística › Almacén", type: "UNIT" },
  ],
};

const cable: CableForEdit = {
  id: "cab1",
  code: "SH-50",
  version: 4,
  description: null,
  typeId: "t1",
  colorId: null,
  manufacturerId: null,
  conductors: 3,
  crossSectionMm2: 2.5,
  outerDiameterMm: null,
  lengthM: 120,
  voltageRating: null,
  originId: "s1",
  destinationId: "s2",
  notes: null,
  installationStatus: "LAID",
  connectionStatus: "CONNECTED",
};

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("CableForm (alta)", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    render(<CableForm mode="create" options={options} />);
  });

  it("shows how the code will be saved", () => {
    type("Código", "sh50");

    expect(screen.getByText("Se guardará como SH-50")).toBeInTheDocument();
  });

  it("validates in the browser with the shared schema before calling the server", async () => {
    type("Código", "sh50");
    type("Sección (mm²)", "2,555");
    type("Origen", "s1");
    type("Instalación", "LAID");
    fireEvent.click(screen.getByRole("button", { name: "Dar de alta" }));

    expect(await screen.findByText(/2 decimales/)).toBeInTheDocument();
    expect(screen.getByLabelText("Sección (mm²)")).toHaveAttribute("aria-invalid", "true");

    // Las reglas entre campos se comprueban cuando cada campo es válido.
    type("Sección (mm²)", "2,5");
    fireEvent.click(screen.getByRole("button", { name: "Dar de alta" }));
    expect(await screen.findByText(/tendido necesita origen y destino/)).toBeInTheDocument();
    expect(screen.queryByText(/2 decimales/)).toBeNull();
    expect(mocks.createCableAction).not.toHaveBeenCalled();
  });

  it("asks where the cable is unless it is laid", () => {
    expect(screen.getByLabelText("Dónde está ahora")).toBeInTheDocument();

    type("Instalación", "LAID");

    expect(screen.queryByLabelText("Dónde está ahora")).toBeNull();
    expect(screen.queryByRole("option", { name: "Retirado" })).toBeNull();
    // A partial laying needs the tray of the loose end: it is recorded with its action.
    expect(screen.queryByRole("option", { name: "Tendido parcial" })).toBeNull();
  });

  it("sends the form and opens the new cable", async () => {
    mocks.createCableAction.mockResolvedValue({ ok: true, message: "ok", id: "new1" });
    type("Código", "sh50");
    type("Longitud (m)", "120,5");
    type("Dónde está ahora", "alm");
    fireEvent.click(screen.getByRole("button", { name: "Dar de alta" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/cables/new1/edit?created=1"));
    const formData = mocks.createCableAction.mock.calls[0]?.[0] as FormData;
    expect(formData.get("code")).toBe("sh50");
    expect(formData.get("lengthM")).toBe("120,5");
    expect(formData.get("currentLocationId")).toBe("alm");
  });

  it("shows the errors returned by the server next to each field", async () => {
    mocks.createCableAction.mockResolvedValue({
      ok: false,
      message: "Revisa los campos marcados.",
      fieldErrors: { code: "Ya existe un cable con el código SH-50." },
    });
    type("Código", "SH-50");
    type("Dónde está ahora", "alm");
    fireEvent.click(screen.getByRole("button", { name: "Dar de alta" }));

    expect(await screen.findByText("Ya existe un cable con el código SH-50.")).toBeInTheDocument();
    expect(screen.getByLabelText("Código")).toHaveValue("SH-50");
  });
});

describe("CableForm (edición)", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
  });

  it("loads the values with decimal commas and sends id and version", async () => {
    mocks.updateCableAction.mockResolvedValue({
      ok: true,
      message: "Cambios guardados.",
      id: "cab1",
      changed: true,
    });
    render(<CableForm mode="edit" options={options} cable={cable} />);

    expect(screen.getByLabelText("Sección (mm²)")).toHaveValue("2,5");
    expect(screen.queryByLabelText("Instalación")).toBeNull();
    expect(screen.getByText(/Tendido · Conectado/)).toBeInTheDocument();

    type("Notas", "Revisado en campo");
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await screen.findByText("Cambios guardados.");
    const formData = mocks.updateCableAction.mock.calls[0]?.[0] as FormData;
    expect(formData.get("id")).toBe("cab1");
    expect(formData.get("version")).toBe("4");
    expect(formData.get("notes")).toBe("Revisado en campo");
    // Regresión: el aviso se perdía al volver a montarse el formulario tras guardar.
    expect(mocks.replace).toHaveBeenCalledWith("/cables/cab1/edit?saved=1");
  });
});

describe("DeleteCableForm", () => {
  it("requires a reason and goes back to the list after the deletion", async () => {
    mocks.deleteCableAction.mockResolvedValue({ ok: true, message: "ok", id: "cab1" });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DeleteCableForm id="cab1" code="SH-50" version={4} />);

    const button = screen.getByRole("button", { name: "Dar de baja" });
    expect(button).toBeDisabled();
    type("Motivo de la baja", "Duplicado");
    fireEvent.click(button);

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/cables?deleted=SH-50"));
    const formData = mocks.deleteCableAction.mock.calls[0]?.[0] as FormData;
    expect(Object.fromEntries(formData)).toEqual({ id: "cab1", version: "4", reason: "Duplicado" });
  });
});
