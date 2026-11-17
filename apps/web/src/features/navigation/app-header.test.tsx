import { act, fireEvent, render, screen, within } from "@testing-library/react";
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

  // Fase 10: lo pendiente de aprobar, siempre a la vista, también con el menú cerrado.
  it("shows how many accounts wait for approval on Usuarios and a dot on the closed menu", () => {
    render(
      <AppHeader
        items={[
          ...items,
          {
            href: "/admin/users",
            label: "Usuarios",
            match: "prefix",
            badge: { count: 2, label: "cuentas pendientes de aprobar" },
          },
        ]}
        user={{ name: "Ada", role: "Administrador" }}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Usuarios, 2 cuentas pendientes de aprobar" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir menú (2 pendientes)" })).toBeInTheDocument();
  });

  it("shows no count when nothing waits", () => {
    render(
      <AppHeader
        items={[
          ...items,
          {
            href: "/admin/users",
            label: "Usuarios",
            match: "prefix",
            badge: { count: 0, label: "x" },
          },
        ]}
        user={{ name: "Ada", role: "Administrador" }}
      />,
    );

    expect(screen.getByRole("link", { name: "Usuarios" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir menú" })).toBeInTheDocument();
  });
});

// La fila del escritorio no cabía con todas las secciones (fase 11): la administración va en
// "Gestión" y lo de cada uno en el menú con su nombre.
describe("AppHeader: menus on a computer", () => {
  const manageItems: NavItem[] = [
    ...items.filter((item) => item.href !== "/activity/me"),
    { href: "/activity/me", label: "Mi actividad", match: "prefix", place: "user" },
    { href: "/catalogs", label: "Catálogos", match: "prefix", place: "manage" },
    {
      href: "/admin/users",
      label: "Usuarios",
      match: "prefix",
      place: "manage",
      badge: { count: 3, label: "cuentas pendientes de aprobar" },
    },
  ];

  beforeEach(() => {
    mocks.pathname = "/admin/users";
  });

  it("keeps only the main sections in the row, and Gestión with what waits in it", () => {
    render(<AppHeader items={manageItems} user={{ name: "Ada", role: "Administrador" }} />);
    const row = screen.getAllByRole("navigation", { name: "Principal" })[0]!;

    expect(
      within(row)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Inicio", "Cables", "Actividad"]);
    const manage = within(row).getByRole("button", { name: "Gestión, 3 pendientes" });
    fireEvent.keyDown(manage, { key: "Enter" });
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Catálogos" })).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Usuarios, 3 cuentas pendientes de aprobar" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("opens the menus when the mouse rests on them, and closes them when it leaves", () => {
    vi.useFakeTimers();
    try {
      render(<AppHeader items={manageItems} user={{ name: "Ada", role: "Administrador" }} />);
      const row = screen.getAllByRole("navigation", { name: "Principal" })[0]!;
      const manage = within(row).getByRole("button", { name: "Gestión, 3 pendientes" });

      fireEvent.pointerEnter(manage, { pointerType: "mouse" });
      expect(screen.getByRole("menu")).toBeInTheDocument();

      // Un clic con el menú ya abierto por el hover no lo cierra.
      fireEvent.pointerDown(manage, { pointerType: "mouse", button: 0 });
      expect(screen.getByRole("menu")).toBeInTheDocument();

      fireEvent.pointerLeave(manage, { pointerType: "mouse" });
      act(() => vi.advanceTimersByTime(200));
      expect(screen.queryByRole("menu")).toBeNull();

      // Un dedo no lo abre al pasar: en una pantalla táctil se toca.
      fireEvent.pointerEnter(screen.getByRole("button", { name: "Menú de Ada" }), {
        pointerType: "touch",
      });
      expect(screen.queryByRole("menu")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens the person's menu with their activity and sign out", () => {
    render(<AppHeader items={manageItems} user={{ name: "Ada", role: "Administrador" }} />);

    fireEvent.keyDown(screen.getByRole("button", { name: "Menú de Ada" }), { key: "Enter" });
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Mi actividad" })).toHaveAttribute(
      "href",
      "/activity/me",
    );
    expect(within(menu).getByRole("menuitem", { name: "Cerrar sesión" })).toBeInTheDocument();
  });
});
