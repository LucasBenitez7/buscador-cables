import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ROLE_PERMISSIONS } from "@cables/shared";
import type { UserEventRow } from "@/server/users/service";
import { RoleGuide } from "./role-guide";
import { UserEvents, describeUserEvent } from "./user-events";

describe("RoleGuide", () => {
  const roles = [
    {
      id: "TECHNICIAN",
      name: "Técnico",
      description: "Trabajo en campo.",
      permissions: [...ROLE_PERMISSIONS.TECHNICIAN],
      users: 5,
    },
    {
      id: "r1",
      name: "Conexionista",
      description: null,
      permissions: ["cable:read" as const, "cable:connect" as const],
      users: 1,
    },
  ];

  it("explains the roles of the database with what each one allows", () => {
    render(<RoleGuide roles={roles} canEdit={false} />);
    const guide = screen.getByRole("region", { name: "Qué puede hacer cada rol" });

    expect(
      within(guide)
        .getAllByRole("term")
        .map((term) => term.textContent),
    ).toEqual(["Técnico", "Conexionista"]);
    expect(within(guide).getByText(/1 persona · 2 permisos/)).toBeInTheDocument();
    const conexionista = within(guide).getByText("Conexionista").closest("details")!;
    fireEvent.click(within(conexionista).getByText("Conexionista"));
    expect(within(conexionista).getByText("Conectar")).toBeInTheDocument();
    expect(within(guide).queryByRole("link", { name: "Editar roles" })).toBeNull();
  });

  it("links to the roles page for who manages roles", () => {
    render(<RoleGuide roles={roles} canEdit />);
    expect(screen.getByRole("link", { name: "Editar roles" })).toHaveAttribute(
      "href",
      "/admin/roles",
    );
  });
});

describe("UserEvents", () => {
  const event = (overrides: Partial<UserEventRow>): UserEventRow => ({
    id: "e1",
    action: "APPROVED",
    actor: "Admin",
    target: "Ana Pérez",
    fromRole: null,
    toRole: "Técnico",
    details: null,
    createdAt: new Date("2026-11-15T15:20:00Z"),
    ...overrides,
  });

  it("says in words who did what to whom", () => {
    expect(describeUserEvent(event({}))).toBe("Admin aprobó a Ana Pérez como Técnico");
    expect(
      describeUserEvent(
        event({ action: "ROLE_CHANGED", fromRole: "Técnico", toRole: "Supervisor" }),
      ),
    ).toBe("Admin cambió a Ana Pérez de Técnico a Supervisor");
    expect(describeUserEvent(event({ action: "DEACTIVATED", toRole: null }))).toBe(
      "Admin desactivó a Ana Pérez",
    );
  });

  // Fase 12: los cambios de roles y de permisos extra, también en palabras.
  it("tells changes to roles and extra permissions, with what was added and removed", () => {
    expect(
      describeUserEvent(
        event({
          action: "PERMISSIONS_CHANGED",
          details: { added: ["cable:test"], removed: ["cable:lay"] },
        }),
      ),
    ).toBe("Admin cambió los permisos extra de Ana Pérez (añadió: timbrar; quitó: tender cables)");
    expect(
      describeUserEvent(
        event({ action: "ROLE_CREATED", target: null, details: { role: "Conexionista" } }),
      ),
    ).toBe("Admin creó el rol Conexionista");
    expect(
      describeUserEvent(
        event({
          action: "ROLE_UPDATED",
          target: null,
          details: { role: "Conexionista", added: ["cable:wiring"], removed: [] },
        }),
      ),
    ).toBe("Admin editó el rol Conexionista (añadió: corregir bornas)");
    expect(
      describeUserEvent(
        event({ action: "ROLE_DELETED", target: null, details: { role: "Viejo" } }),
      ),
    ).toBe("Admin borró el rol Viejo");
  });

  it("lists the changes with their time, or says there are none", () => {
    const { rerender } = render(<UserEvents events={[event({})]} />);
    expect(screen.getByText("Admin aprobó a Ana Pérez como Técnico")).toBeInTheDocument();
    expect(screen.getByText(/16:20/)).toBeInTheDocument();

    rerender(<UserEvents events={[]} />);
    expect(screen.getByText("Todavía no hay cambios registrados.")).toBeInTheDocument();
  });
});
