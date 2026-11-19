import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PendingListContext } from "@/components/pending-list";
import { CableViewTabs } from "./cable-view-tabs";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/cables/1",
  useSearchParams: () => new URLSearchParams(),
}));

const tabs = [
  { id: "recorrido", label: "Recorrido", href: "/cables/1?vista=recorrido" },
  { id: "conexionado", label: "Conexionado", href: "/cables/1?vista=conexionado", count: 12 },
];

describe("CableViewTabs", () => {
  it("marks the current view and shows how many wires there are", () => {
    render(<CableViewTabs tabs={tabs} current="recorrido" />);

    expect(screen.getByRole("link", { name: "Recorrido" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Recorrido" })).toHaveClass("bg-primary");
    expect(screen.getByRole("link", { name: /^Conexionado/ })).not.toHaveClass("bg-primary");
    expect(screen.getByRole("link", { name: /^Conexionado/ })).toHaveTextContent("12");
  });

  it("marks the tab pressed at once while its view is on its way", () => {
    const navigate = vi.fn();
    const { rerender } = render(
      <PendingListContext.Provider value={{ navigate, pending: false }}>
        <CableViewTabs tabs={tabs} current="recorrido" />
      </PendingListContext.Provider>,
    );

    fireEvent.click(screen.getByRole("link", { name: /^Conexionado/ }));
    expect(navigate).toHaveBeenCalledWith("/cables/1?vista=conexionado", { scroll: true });

    rerender(
      <PendingListContext.Provider value={{ navigate, pending: true }}>
        <CableViewTabs tabs={tabs} current="recorrido" />
      </PendingListContext.Provider>,
    );
    expect(screen.getByRole("link", { name: /^Conexionado/ })).toHaveClass("bg-primary");
    expect(screen.getByRole("link", { name: "Recorrido" })).not.toHaveClass("bg-primary");
  });
});
