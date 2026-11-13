import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRow } from "@/server/users/service";
import { UsersTable } from "./users-table";

const { changeRoleAction, setUserActiveAction } = vi.hoisted(() => ({
  changeRoleAction: vi.fn(),
  setUserActiveAction: vi.fn(),
}));

vi.mock("@/features/users/actions", () => ({ changeRoleAction, setUserActiveAction }));

const technician: UserRow = {
  id: "u2",
  name: "Ana Pérez",
  email: "ana@planta.example",
  role: "TECHNICIAN",
  active: true,
  pending: false,
  createdAt: new Date("2026-11-01T00:00:00Z"),
};

function renderTable() {
  render(<UsersTable users={[technician]} currentUserId="u1" currentRole="ADMIN" />);
  return screen.getByLabelText<HTMLSelectElement>("Rol de Ana Pérez");
}

describe("UsersTable", () => {
  beforeEach(() => {
    changeRoleAction.mockReset();
    setUserActiveAction.mockReset();
  });

  it("sends the new role to the server", async () => {
    changeRoleAction.mockResolvedValue({ ok: true, message: "Rol actualizado." });
    const select = renderTable();

    fireEvent.change(select, { target: { value: "SUPERVISOR" } });

    await screen.findByText("Rol actualizado.");
    const formData = changeRoleAction.mock.calls[0]?.[0] as FormData;
    expect(formData.get("userId")).toBe("u2");
    expect(formData.get("role")).toBe("SUPERVISOR");
    expect(select.value).toBe("SUPERVISOR");
  });

  // Regresión: el selector no controlado se quedaba mostrando el rol rechazado.
  it("reverts the select to the real role when the server rejects the change", async () => {
    changeRoleAction.mockResolvedValue({ ok: false, message: "No tienes permiso." });
    const select = renderTable();

    fireEvent.change(select, { target: { value: "ADMIN" } });

    await screen.findByText("No tienes permiso.");
    await waitFor(() => expect(select.value).toBe("TECHNICIAN"));
  });

  // Revisión F0-F7 (A2): las cuentas registradas esperan a que un administrador las apruebe.
  it("shows accounts waiting for approval and approves them", async () => {
    setUserActiveAction.mockResolvedValue({ ok: true, message: "Cuenta aprobada." });
    render(
      <UsersTable
        users={[{ ...technician, role: "VIEWER", active: false, pending: true }]}
        currentUserId="u1"
        currentRole="ADMIN"
      />,
    );

    expect(screen.getByText("Pendiente de aprobación")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));

    await screen.findByText("Cuenta aprobada.");
    const formData = setUserActiveAction.mock.calls[0]?.[0] as FormData;
    expect(Object.fromEntries(formData)).toEqual({ userId: "u2", active: "true" });
  });

  it("offers to reactivate an account that was deactivated", () => {
    render(
      <UsersTable
        users={[{ ...technician, active: false }]}
        currentUserId="u1"
        currentRole="ADMIN"
      />,
    );

    expect(screen.getByText("Desactivado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reactivar" })).toBeInTheDocument();
  });

  it("does not offer actions on your own account", () => {
    render(
      <UsersTable users={[{ ...technician, id: "u1" }]} currentUserId="u1" currentRole="ADMIN" />,
    );

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Desactivar" })).toBeNull();
    expect(screen.getByText("(tú)")).toBeInTheDocument();
  });
});
