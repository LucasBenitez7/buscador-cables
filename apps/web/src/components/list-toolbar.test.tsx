import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PendingListContext } from "@/components/pending-list";
import { ListToolbar } from "./list-toolbar";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  push.mockReset();
});

const sort = {
  name: "sort",
  value: "code",
  defaultValue: "code",
  options: [
    { value: "code", label: "Código (A-Z)" },
    { value: "code-desc", label: "Código (Z-A)" },
  ],
};

const filters = [
  {
    kind: "select" as const,
    name: "kind",
    label: "Tipo",
    options: [{ value: "LADDER", label: "Bandeja de escalera" }],
  },
  { kind: "checkbox" as const, name: "waiting", label: "Solo con cables esperando" },
];

function renderToolbar(props: Partial<Parameters<typeof ListToolbar>[0]> = {}) {
  return render(
    <ListToolbar
      action="/trays"
      label="Buscar bandejas"
      search={{ name: "q", label: "Código de bandeja", placeholder: "99UXA…", mono: true }}
      sort={sort}
      filters={filters}
      count={<span>12 bandejas</span>}
      {...props}
    />,
  );
}

describe("ListToolbar", () => {
  it("sends only the values that are filled in, in the order of the form", () => {
    renderToolbar();

    fireEvent.change(screen.getByLabelText("Código de bandeja"), {
      target: { value: "  99uxa " },
    });
    fireEvent.change(screen.getByLabelText("Orden"), { target: { value: "code-desc" } });
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "LADDER" } });
    fireEvent.click(screen.getByLabelText("Solo con cables esperando"));
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));

    expect(push).toHaveBeenCalledWith("/trays?q=99uxa&sort=code-desc&kind=LADDER&waiting=1");
  });

  it("leaves out empty values and the default order", () => {
    renderToolbar();

    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));

    expect(push).toHaveBeenCalledWith("/trays");
  });

  it("keeps the values that are not filters", () => {
    renderToolbar({ keep: { size: "120" } });

    fireEvent.change(screen.getByLabelText("Código de bandeja"), { target: { value: "UX" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));

    expect(push).toHaveBeenCalledWith("/trays?size=120&q=UX");
  });

  it("offers «Limpiar» only when a filter is on, and keeps the kept values", () => {
    const { rerender } = renderToolbar({ keep: { size: "120" } });
    expect(screen.queryByRole("link", { name: "Limpiar" })).not.toBeInTheDocument();

    rerender(
      <ListToolbar
        action="/trays"
        label="Buscar bandejas"
        search={{ name: "q", label: "Código de bandeja" }}
        sort={sort}
        keep={{ size: "120" }}
        active
        count="x"
      />,
    );
    expect(screen.getByRole("link", { name: "Limpiar" })).toHaveAttribute(
      "href",
      "/trays?size=120",
    );
  });

  it("shows the count under the bar", () => {
    renderToolbar();

    expect(screen.getByRole("status")).toHaveTextContent("12 bandejas");
  });

  it("shows «Cargando…» on the button and disables it while navigating", () => {
    render(
      <PendingListContext.Provider value={{ navigate: vi.fn(), pending: true }}>
        <ListToolbar
          action="/equipment"
          label="Buscar equipos"
          search={{ name: "q", label: "Código del equipo" }}
          count="x"
        />
      </PendingListContext.Provider>,
    );

    const button = screen.getByRole("button", { name: "Cargando…" });
    expect(button).toBeDisabled();
  });
});
