import type { ReactNode } from "react";
import { hasPermission, ROLE_LABELS } from "@cables/shared";
import { AppHeader } from "@/features/navigation/app-header";
import type { NavItem } from "@/features/navigation/nav-items";
import { requireUser } from "@/server/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Comprobación real en servidor. El proxy solo mira si existe la cookie.
  const user = await requireUser();

  // Cada uno ve solo las secciones que su rol permite.
  const items: NavItem[] = [
    { href: "/", label: "Inicio", match: "exact" },
    { href: "/cables", label: "Cables", match: "prefix" },
    { href: "/trays", label: "Bandejas", match: "prefix" },
    { href: "/locations", label: "Ubicaciones", match: "prefix" },
    { href: "/activity/me", label: "Mi actividad", match: "prefix" },
    ...(hasPermission(user.role, "activity:view")
      ? [{ href: "/activity", label: "Actividad", match: "exact" } as const]
      : []),
    ...(hasPermission(user.role, "catalog:manage")
      ? [{ href: "/catalogs", label: "Catálogos", match: "prefix" } as const]
      : []),
    ...(hasPermission(user.role, "user:manage")
      ? [{ href: "/admin/users", label: "Usuarios", match: "prefix" } as const]
      : []),
  ];

  return (
    <div className="min-h-dvh">
      <AppHeader items={items} user={{ name: user.name, role: ROLE_LABELS[user.role] }} />
      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
