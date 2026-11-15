import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateUserForm } from "./create-user-form";

const { createUserAction } = vi.hoisted(() => ({ createUserAction: vi.fn() }));

vi.mock("@/features/users/actions", () => ({ createUserAction }));

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Ana Pérez" } });
  fireEvent.change(screen.getByLabelText("Correo electrónico"), {
    target: { value: "ana@cables.test" },
  });
  fireEvent.change(screen.getByLabelText("Rol"), { target: { value: "TECHNICIAN" } });
  fireEvent.change(screen.getByLabelText("Contraseña temporal"), {
    target: { value: "clave-temporal-1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Crear usuario" }));
}

describe("CreateUserForm", () => {
  beforeEach(() => {
    createUserAction.mockReset();
    render(<CreateUserForm currentRole="ADMIN" />);
  });

  // Regresión: React 19 vaciaba el formulario también cuando el servidor rechazaba el alta.
  it("keeps the typed values when the server rejects the user", async () => {
    createUserAction.mockResolvedValue({
      ok: false,
      message: "Ya existe un usuario con ese correo.",
    });

    fillAndSubmit();

    await screen.findByText("Ya existe un usuario con ese correo.");
    expect(screen.getByLabelText("Nombre")).toHaveValue("Ana Pérez");
    expect(screen.getByLabelText("Correo electrónico")).toHaveValue("ana@cables.test");
    expect(screen.getByLabelText("Rol")).toHaveValue("TECHNICIAN");
  });

  it("clears the form after a successful creation", async () => {
    createUserAction.mockResolvedValue({ ok: true, message: "Usuario ana@cables.test creado." });

    fillAndSubmit();

    await screen.findByText("Usuario ana@cables.test creado.");
    await waitFor(() => expect(screen.getByLabelText("Nombre")).toHaveValue(""));
    expect(screen.getByLabelText("Rol")).toHaveValue("VIEWER");
  });

  it("sends the field values to the server action", async () => {
    createUserAction.mockResolvedValue({ ok: true, message: "ok" });

    fillAndSubmit();

    await waitFor(() => expect(createUserAction).toHaveBeenCalled());
    const formData = createUserAction.mock.calls[0]?.[1] as FormData;
    expect(Object.fromEntries(formData)).toEqual({
      name: "Ana Pérez",
      email: "ana@cables.test",
      role: "TECHNICIAN",
      password: "clave-temporal-1",
    });
  });
});
