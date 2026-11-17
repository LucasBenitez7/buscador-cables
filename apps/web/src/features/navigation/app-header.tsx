"use client";

import { cn } from "cn";
import { ChevronDownIcon, MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrandLogo } from "@/components/brand-logo";
import { SignOutButton, useSignOut } from "@/features/auth/components/sign-out-button";
import { isActive, type NavItem } from "./nav-items";
import { useHoverMenu } from "./use-hover-menu";

type Props = {
  items: NavItem[];
  user: { name: string; role: string };
};

/**
 * App header. From 1280 px the main sections sit in a row, administration goes in a "Gestión"
 * menu and the person's own things in the menu with their name, so the row always fits (it
 * did not with every section in it). Below that (phones and tablets, where the app is used
 * most) a menu button opens a side panel with everything. The current section is highlighted:
 * light text on a soft background, the rest muted until hovered.
 */
export function AppHeader({ items, user }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const waiting = items.reduce((sum, item) => sum + (item.badge?.count ?? 0), 0);
  const main = items.filter((item) => (item.place ?? "main") === "main");
  const manage = items.filter((item) => item.place === "manage");
  const own = items.filter((item) => item.place === "user");

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-6">
          <Link
            href="/"
            className="focus-visible:ring-ring/50 flex items-center gap-2 rounded-md font-semibold whitespace-nowrap outline-none focus-visible:ring-3"
          >
            <BrandLogo className="size-7" />
            Buscador de Cables
          </Link>
          <nav aria-label="Principal" className="hidden items-center gap-1 xl:flex">
            {main.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item, pathname)} />
            ))}
            {manage.length > 0 ? <ManageMenu items={manage} pathname={pathname} /> : null}
          </nav>
        </div>

        <div className="hidden xl:block">
          <UserMenu user={user} items={own} pathname={pathname} />
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            className="text-muted-foreground hover:text-foreground hover:bg-accent active:bg-accent/70 focus-visible:ring-ring/50 -mr-1.5 rounded-md p-2 outline-none focus-visible:ring-3 xl:hidden"
            aria-label={
              waiting === 0
                ? "Abrir menú"
                : `Abrir menú (${waiting} ${waiting === 1 ? "pendiente" : "pendientes"})`
            }
          >
            <span className="relative block">
              <MenuIcon className="size-6" />
              {waiting > 0 ? (
                // En el móvil el menú está cerrado: el punto avisa de que hay algo pendiente.
                <span
                  aria-hidden
                  className="bg-warning ring-background absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2"
                />
              ) : null}
            </span>
          </SheetTrigger>
          <SheetContent>
            <SheetTitle>Menú</SheetTitle>
            <SheetDescription className="sr-only">Secciones de la aplicación</SheetDescription>
            <nav aria-label="Principal" className="flex flex-col gap-1">
              {items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(item, pathname)}
                  large
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </nav>
            <div className="mt-auto space-y-3 border-t pt-4">
              <UserBadge user={user} />
              <SignOutButton />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

function NavLink({
  item,
  active,
  large,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  large?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={
        item.badge && item.badge.count > 0
          ? `${item.label}, ${item.badge.count} ${item.badge.label}`
          : undefined
      }
      onClick={onNavigate}
      className={cn(
        "focus-visible:ring-ring/50 inline-flex items-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3",
        large ? "border-l-2 px-3 py-3 text-base" : "px-3 py-1.5 text-sm",
        active
          ? "bg-accent text-foreground border-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/60 active:bg-accent border-transparent",
      )}
    >
      {item.label}
      {item.badge && item.badge.count > 0 ? (
        <span
          aria-hidden
          className="bg-warning text-primary-foreground min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-bold tabular-nums"
          title={item.badge.label}
        >
          {item.badge.count}
        </span>
      ) : null}
    </Link>
  );
}

const MENU_TRIGGER =
  "focus-visible:ring-ring/50 data-[state=open]:bg-accent inline-flex items-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3";

/** "Gestión": the administration sections, with the sum of what waits in them. */
function ManageMenu({ items, pathname }: { items: NavItem[]; pathname: string }) {
  const active = items.some((item) => isActive(item, pathname));
  const waiting = items.reduce((sum, item) => sum + (item.badge?.count ?? 0), 0);
  const hover = useHoverMenu();
  return (
    <DropdownMenu {...hover.root}>
      <DropdownMenuTrigger
        {...hover.trigger}
        aria-label={waiting > 0 ? `Gestión, ${waiting} pendientes` : undefined}
        className={cn(
          MENU_TRIGGER,
          "px-3 py-1.5",
          active
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/60",
        )}
      >
        Gestión
        {waiting > 0 ? <Count value={waiting} /> : null}
        <ChevronDownIcon aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" {...hover.content}>
        {items.map((item) => (
          <DropdownMenuItem key={item.href} asChild data-current={isActive(item, pathname)}>
            <Link
              href={item.href}
              aria-current={isActive(item, pathname) ? "page" : undefined}
              aria-label={
                item.badge && item.badge.count > 0
                  ? `${item.label}, ${item.badge.count} ${item.badge.label}`
                  : undefined
              }
            >
              {item.label}
              {item.badge && item.badge.count > 0 ? <Count value={item.badge.count} /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The person's name and role; opens their own things and "Cerrar sesión". */
function UserMenu({
  user,
  items,
  pathname,
}: {
  user: { name: string; role: string };
  items: NavItem[];
  pathname: string;
}) {
  const { signOut, pending } = useSignOut();
  const hover = useHoverMenu();
  return (
    <DropdownMenu {...hover.root}>
      <DropdownMenuTrigger
        {...hover.trigger}
        aria-label={`Menú de ${user.name}`}
        className={cn(MENU_TRIGGER, "hover:bg-accent/60 px-2 py-1 text-left")}
      >
        <UserBadge user={user} />
        <ChevronDownIcon aria-hidden className="text-muted-foreground size-4" />
      </DropdownMenuTrigger>
      {/* El nombre y el rol ya están en el botón: el menú no los repite. */}
      <DropdownMenuContent {...hover.content}>
        {items.map((item) => (
          <DropdownMenuItem key={item.href} asChild data-current={isActive(item, pathname)}>
            <Link href={item.href} aria-current={isActive(item, pathname) ? "page" : undefined}>
              {item.label}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem
          disabled={pending}
          onSelect={() => void signOut()}
          className="text-destructive focus:bg-destructive/15 focus:text-destructive"
        >
          {pending ? "Saliendo…" : "Cerrar sesión"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Count({ value }: { value: number }) {
  return (
    <span
      aria-hidden
      className="bg-warning text-primary-foreground min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-bold tabular-nums"
    >
      {value}
    </span>
  );
}

function UserBadge({ user }: { user: { name: string; role: string } }) {
  return (
    <div className="text-sm leading-tight xl:text-right">
      <p className="font-medium">{user.name}</p>
      <p className="text-muted-foreground text-xs">{user.role}</p>
    </div>
  );
}
