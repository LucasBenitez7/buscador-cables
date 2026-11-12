import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppHeader } from "./app-header";
import { isActive, type NavItem } from "./nav-items";

const mocks = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: vi.fn() } }));

const items: NavItem[] = [
  { href: "/", label: "Inicio", match: "exact" },
  { href: "/cables", label: "Cables", match: "prefix" },
  { href: "/activity/me", label: "Mi actividad", match: "prefix" },
  { href: "/activity", label: "Actividad", match: "exact" },
];

describe("isActive", () => {
  it("marks a section and everything under it", () => {
    expect(isActive(items[1]!, "/cables")).toBe(true);
    expect(isActive(items[1]!, "/cables/abc/edit")).toBe(true);
    expect(isActive(items[1]!, "/cablesx")).toBe(false);
  });

  it("keeps home and recent activity exact, so they do not light up elsewhere", () => {
    expect(isActive(items[0]!, "/cables")).toBe(false);
    expect(isActive(items[3]!, "/activity/me")).toBe(false);
    expect(isActive(items[2]!, "/activity/me")).toBe(true);
  });
});

describe("AppHeader", () => {
  beforeEach(() => {
    mocks.pathname = "/";
  });

  it("highlights only the current section", () => {
    mocks.pathname = "/cables/abc";
    render(<AppHeader items={items} user={{ name: "Ana", role: "Técnico" }} />);

    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(within(nav).getByRole("link", { name: "Cables" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: "Cables" })).toHaveClass("text-foreground");
    expect(within(nav).getByRole("link", { name: "Inicio" })).toHaveClass("text-muted-foreground");
  });

  it("opens the mobile menu and closes it after choosing a section", () => {
    mocks.pathname = "/activity/me";
    render(<AppHeader items={items} user={{ name: "Ana", role: "Técnico" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Abrir menú" }));
    const menu = screen.getByRole("dialog");
    expect(within(menu).getByRole("link", { name: "Mi actividad" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(menu).getByRole("link", { name: "Actividad" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(within(menu).getByText("Ana")).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();

    fireEvent.click(within(menu).getByRole("link", { name: "Cables" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
