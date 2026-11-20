import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChangeList } from "./change-list";

describe("ChangeList", () => {
  // Fase 17: «Timbrado · Sin timbrar → Timbrado» repetía lo mismo dos veces.
  it("leaves out the name of a state, which its values already say", () => {
    render(
      <ChangeList
        changes={[
          { field: "Timbrado", from: "Sin timbrar", to: "Timbrado" },
          { field: "Longitud (m)", from: "120", to: "125" },
        ]}
      />,
    );

    expect(screen.getByText("Timbrado", { selector: "dt" })).toHaveClass("sr-only");
    expect(screen.getByText("Longitud (m)", { selector: "dt" })).not.toHaveClass("sr-only");
    expect(screen.getByText("Sin timbrar")).toBeVisible();
  });
});
