import { fireEvent, render, screen, within } from "@testing-library/react";
import { ROLE_PERMISSIONS } from "@cables/shared";
import { describe, expect, it } from "vitest";
import { RolesCompare } from "./roles-compare";

const roles = [
  { id: "SUPERVISOR", name: "Supervisor", permissions: ROLE_PERMISSIONS.SUPERVISOR },
  { id: "TECHNICIAN", name: "Técnico", permissions: ROLE_PERMISSIONS.TECHNICIAN },
  { id: "VIEWER", name: "Consulta", permissions: ROLE_PERMISSIONS.VIEWER },
];

const rowNames = (table: HTMLElement) =>
  within(table)
    .getAllByRole("rowheader")
    .map((cell) => cell.textContent);

describe("RolesCompare", () => {
  it("puts the permissions in rows and the roles in columns, without section titles", () => {
    render(<RolesCompare roles={roles} />);
    const table = screen.getByRole("table");

    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual(["Permiso", "Supervisor", "Técnico", "Consulta"]);
    expect(within(table).queryByText("Trabajo en campo")).toBeNull();

    const lay = within(table).getByRole("row", { name: /Tender cables/ });
    expect(
      within(lay)
        .getAllByLabelText(/^(sí|no)$/)
        .map((mark) => mark.ariaLabel),
    ).toEqual(["sí", "sí", "no"]);
  });

  it("with «Solo diferencias», hides what every role has", () => {
    render(<RolesCompare roles={roles} />);
    const table = screen.getByRole("table");
    expect(rowNames(table)).toContain("Ver cables, bandejas, equipos y planos");

    fireEvent.click(screen.getByLabelText("Solo diferencias"));

    expect(rowNames(table)).not.toContain("Ver cables, bandejas, equipos y planos");
    expect(rowNames(table)).toContain("Tender cables");
  });

  it("on a phone, sets two roles face to face and marks where they differ", () => {
    render(<RolesCompare roles={roles} />);
    fireEvent.change(screen.getByLabelText("Frente a"), { target: { value: "VIEWER" } });
    fireEvent.click(screen.getByLabelText("Solo diferencias"));

    const list = screen.getAllByRole("list").at(-1)!;
    const items = within(list).getAllByRole("listitem");
    expect(items.length).toBeGreaterThan(0);
    // Todas distintas entre Supervisor y Consulta, y cada una lo dice.
    for (const item of items) {
      expect(item.textContent).toContain("(distinto)");
    }
    expect(within(items[0]!).getByLabelText("Supervisor: sí")).toBeTruthy();
    expect(within(items[0]!).getByLabelText("Consulta: no")).toBeTruthy();
  });

  it("says when the two roles have the same permissions", () => {
    render(<RolesCompare roles={roles} />);
    fireEvent.change(screen.getByLabelText("Frente a"), { target: { value: "SUPERVISOR" } });
    fireEvent.click(screen.getByLabelText("Solo diferencias"));

    expect(screen.getByRole("status").textContent).toBe("Tienen los mismos permisos.");
  });
});
