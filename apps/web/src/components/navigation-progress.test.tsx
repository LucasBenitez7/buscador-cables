import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NavigationProgress,
  isNavigationClick,
  startNavigationProgress,
} from "./navigation-progress";

const mocks = vi.hoisted(() => ({ pathname: "/cables", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

function clickOn(href: string, init: MouseEventInit & { target?: string } = {}) {
  const anchor = document.createElement("a");
  anchor.href = href;
  if (init.target) anchor.target = init.target;
  document.body.append(anchor);
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
  Object.defineProperty(event, "target", { value: anchor });
  anchor.remove();
  return event;
}

describe("isNavigationClick", () => {
  // Mismo origen que el documento de jsdom, que es contra el que se resuelven los enlaces.
  const here = new URL("/cables/1?vista=recorrido", window.location.origin) as unknown as Location;

  it("counts a plain click on a link to another page or view", () => {
    expect(isNavigationClick(clickOn("/cables/2"), here)).toBe(true);
    expect(isNavigationClick(clickOn("/cables/1?vista=conexionado"), here)).toBe(true);
  });

  it("leaves out new tabs, other sites and jumps inside the page", () => {
    expect(isNavigationClick(clickOn("/cables/2", { ctrlKey: true }), here)).toBe(false);
    expect(isNavigationClick(clickOn("/cables/2", { button: 1 }), here)).toBe(false);
    expect(isNavigationClick(clickOn("/cables/2", { target: "_blank" }), here)).toBe(false);
    expect(isNavigationClick(clickOn("https://example.com/"), here)).toBe(false);
    expect(isNavigationClick(clickOn("/cables/1?vista=recorrido#historial"), here)).toBe(false);
  });
});

describe("NavigationProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.pathname = "/cables";
    mocks.search = "";
  });
  afterEach(() => vi.useRealTimers());

  const phase = () => screen.getByTestId("navigation-progress").dataset.phase;

  it("shows the bar while the next page takes long, and hides it when it arrives", () => {
    const { rerender } = render(<NavigationProgress />);
    expect(phase()).toBe("idle");

    act(() => startNavigationProgress());
    expect(phase()).toBe("waiting");
    act(() => vi.advanceTimersByTime(150));
    expect(phase()).toBe("running");

    mocks.pathname = "/cables/1";
    rerender(<NavigationProgress />);
    expect(phase()).toBe("done");
    act(() => vi.advanceTimersByTime(300));
    expect(phase()).toBe("idle");
  });

  it("does not flash on a page that comes at once", () => {
    const { rerender } = render(<NavigationProgress />);

    act(() => startNavigationProgress());
    mocks.search = "page=2";
    rerender(<NavigationProgress />);

    expect(phase()).toBe("idle");
  });

  it("gives up on a navigation that never ends", () => {
    render(<NavigationProgress />);

    act(() => startNavigationProgress());
    act(() => vi.advanceTimersByTime(21_000));

    expect(phase()).toBe("idle");
  });
});
