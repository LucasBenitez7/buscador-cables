import Link from "next/link";
import type { ReactNode } from "react";
import { hasPermission, ROLE_LABELS } from "@cables/shared";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { requireUser } from "@/server/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Comprobación real en servidor. El proxy solo mira si existe la cookie.
  const user = await requireUser();
  const canManageUsers = hasPermission(user.role, "user:manage");
  const canManageCatalogs = hasPermission(user.role, "catalog:manage");

  return (
    <div className="min-h-dvh">
      <header className="bg-background border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm sm:gap-x-5">
            <Link href="/" className="font-semibold whitespace-nowrap">
              Buscador de Cables
            </Link>
            <Link href="/cables" className="text-muted-foreground hover:text-foreground">
              Cables
            </Link>
            <Link href="/locations" className="text-muted-foreground hover:text-foreground">
              Ubicaciones
            </Link>
            {canManageCatalogs ? (
              <Link href="/catalogs" className="text-muted-foreground hover:text-foreground">
                Catálogos
              </Link>
            ) : null}
            {canManageUsers ? (
              <Link href="/admin/users" className="text-muted-foreground hover:text-foreground">
                Usuarios
              </Link>
            ) : null}
          </nav>
          <div className="flex items-center gap-4">
            <div className="text-right text-sm leading-tight">
              <p className="font-medium">{user.name}</p>
              <p className="text-muted-foreground text-xs">{ROLE_LABELS[user.role]}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4 sm:p-6">{children}</main>
    </div>
  );
}
