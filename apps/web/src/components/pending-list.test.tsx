import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PendingLink,
  PendingListContext,
  PendingListProvider,
  PendingResults,
  SubmitLabel,
  usePendingNavigation,
} from "./pending-list";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  push.mockReset();
});

function Navigate({ href, options }: { href: string; options?: { scroll?: boolean } }) {
  const { navigate, pending } = usePendingNavigation();
  return (
    <button type="button" onClick={() => navigate(href, options)}>
      ir {pending ? "(pendiente)" : ""}
    </button>
  );
}

describe("usePendingNavigation", () => {
  it("uses router.push when there is no provider", () => {
    render(<Navigate href="/cables?q=sh50" />);

    fireEvent.click(screen.getByRole("button", { name: "ir" }));

    expect(push).toHaveBeenCalledWith("/cables?q=sh50");
  });

  it("passes the scroll option when asked for it, without a provider", () => {
    render(<Navigate href="/cables" options={{ scroll: false }} />);

    fireEvent.click(screen.getByRole("button", { name: "ir" }));

    expect(push).toHaveBeenCalledWith("/cables", { scroll: false });
  });

  it("navigates inside the provider, scrolling by default", () => {
    render(
      <PendingListProvider>
        <Navigate href="/activity?page=2" />
      </PendingListProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "ir" }));

    expect(push).toHaveBeenCalledWith("/activity?page=2", { scroll: true });
  });
});

describe("PendingResults", () => {
  it("shows the loader instead of the results while navigating", () => {
    render(
      <PendingListContext.Provider value={{ navigate: vi.fn(), pending: true }}>
        <PendingResults>
          <p>Resultado anterior</p>
        </PendingResults>
      </PendingListContext.Provider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Cargando…");
    expect(screen.queryByText("Resultado anterior")).not.toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it("shows the results when nothing is pending, with or without a provider", () => {
    const { unmount } = render(
      <PendingListContext.Provider value={{ navigate: vi.fn(), pending: false }}>
        <PendingResults>
          <p>Resultados</p>
        </PendingResults>
      </PendingListContext.Provider>,
    );
    expect(screen.getByText("Resultados")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    unmount();

    render(
      <PendingResults>
        <p>Sin provider</p>
      </PendingResults>,
    );
    expect(screen.getByText("Sin provider")).toBeInTheDocument();
  });
});

describe("SubmitLabel", () => {
  it("keeps the button text, or says Cargando… while navigating", () => {
    const { rerender } = render(<SubmitLabel pending={false} idle="Aplicar" />);
    expect(screen.getByText("Aplicar")).toBeInTheDocument();

    rerender(<SubmitLabel pending idle="Aplicar" />);
    expect(screen.getByText("Cargando…")).toBeInTheDocument();
    expect(screen.queryByText("Aplicar")).not.toBeInTheDocument();
  });
});

describe("PendingLink", () => {
  it("navigates with the provider and does not follow the link itself", () => {
    render(
      <PendingListProvider>
        <PendingLink href="/cables?page=2">Siguiente</PendingLink>
      </PendingListProvider>,
    );

    const notPrevented = fireEvent.click(screen.getByRole("link", { name: "Siguiente" }));

    expect(notPrevented).toBe(false);
    expect(push).toHaveBeenCalledWith("/cables?page=2", { scroll: true });
  });

  it("leaves ctrl/cmd, shift and middle clicks to the browser", () => {
    render(
      <PendingListProvider>
        <PendingLink href="/cables?page=2">Siguiente</PendingLink>
      </PendingListProvider>,
    );
    const link = screen.getByRole("link", { name: "Siguiente" });

    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
    expect(fireEvent.click(link, { metaKey: true })).toBe(true);
    expect(fireEvent.click(link, { shiftKey: true })).toBe(true);
    expect(fireEvent.click(link, { button: 1 })).toBe(true);
    expect(push).not.toHaveBeenCalled();
  });

  it("is a plain link without a provider", () => {
    render(<PendingLink href="/trays?page=3">Página 3</PendingLink>);

    expect(screen.getByRole("link", { name: "Página 3" })).toHaveAttribute("href", "/trays?page=3");
    expect(push).not.toHaveBeenCalled();
  });
});
