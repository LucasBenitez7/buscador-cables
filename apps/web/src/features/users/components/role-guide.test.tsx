import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { UserEventRow } from "@/server/users/service";
import { RoleGuide } from "./role-guide";
import { UserEvents, describeUserEvent } from "./user-events";

describe("RoleGuide", () => {
  it("explains every role, from the least to the most", () => {
    render(<RoleGuide />);
    const guide = screen.getByRole("region", { name: "Qué puede hacer cada rol" });

    const roles = within(guide)
      .getAllByRole("term")
      .map((term) => term.textContent);
    expect(roles).toEqual(["Consulta", "Técnico", "Supervisor", "Administrador"]);
    expect(within(guide).getByText(/Conectar, desconectar y timbrar/)).toBeInTheDocument();
  });
});

describe("UserEvents", () => {
  const event = (overrides: Partial<UserEventRow>): UserEventRow => ({
    id: "e1",
    action: "APPROVED",
    actor: "Admin",
    target: "Ana Pérez",
    fromRole: null,
    toRole: "TECHNICIAN",
    createdAt: new Date("2026-11-15T15:20:00Z"),
    ...overrides,
  });

  it("says in words who did what to whom", () => {
    expect(describeUserEvent(event({}))).toBe("Admin aprobó a Ana Pérez como Técnico");
    expect(
      describeUserEvent(
        event({ action: "ROLE_CHANGED", fromRole: "TECHNICIAN", toRole: "SUPERVISOR" }),
      ),
    ).toBe("Admin cambió a Ana Pérez de Técnico a Supervisor");
    expect(describeUserEvent(event({ action: "DEACTIVATED", toRole: null }))).toBe(
      "Admin desactivó a Ana Pérez",
    );
  });

  it("lists the changes with their time, or says there are none", () => {
    const { rerender } = render(<UserEvents events={[event({})]} />);
    expect(screen.getByText("Admin aprobó a Ana Pérez como Técnico")).toBeInTheDocument();
    expect(screen.getByText(/16:20/)).toBeInTheDocument();

    rerender(<UserEvents events={[]} />);
    expect(screen.getByText("Todavía no hay cambios registrados.")).toBeInTheDocument();
  });
});
