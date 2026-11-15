"use client";

import { cn } from "cn";
import { MenuIcon } from "lucide-react";
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
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { isActive, type NavItem } from "./nav-items";

type Props = {
  items: NavItem[];
  user: { name: string; role: string };
};

/**
 * App header. From 1280 px the links sit in a row; below that (phones and tablets, where the
 * app is used most) a menu button opens a side panel. The current section is highlighted in
 * both: light text on a soft background, the rest muted until hovered.
 */
export function AppHeader({ items, user }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-6">
          <Link
            href="/"
            className="focus-visible:ring-ring/50 rounded-md font-semibold whitespace-nowrap outline-none focus-visible:ring-3"
          >
            Buscador de Cables
          </Link>
          <nav aria-label="Principal" className="hidden items-center gap-1 xl:flex">
            {items.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item, pathname)} />
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-4 xl:flex">
          <UserBadge user={user} />
          <SignOutButton />
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            className="text-muted-foreground hover:text-foreground hover:bg-accent active:bg-accent/70 focus-visible:ring-ring/50 -mr-1.5 rounded-md p-2 outline-none focus-visible:ring-3 xl:hidden"
            aria-label="Abrir menú"
          >
            <MenuIcon className="size-6" />
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
      onClick={onNavigate}
      className={cn(
        "focus-visible:ring-ring/50 rounded-md font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3",
        large ? "border-l-2 px-3 py-3 text-base" : "px-3 py-1.5 text-sm",
        active
          ? "bg-accent text-foreground border-primary"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/60 active:bg-accent border-transparent",
      )}
    >
      {item.label}
    </Link>
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
