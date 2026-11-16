import type { ReactNode } from "react";
import { hasPermission, ROLE_LABELS } from "@cables/shared";
import { AppHeader } from "@/features/navigation/app-header";
import type { NavItem } from "@/features/navigation/nav-items";
import { requireUser } from "@/server/session";
import { countPendingAccounts } from "@/server/users/service";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Comprobación real en servidor. El proxy solo mira si existe la cookie.
  const user = await requireUser();
  const canManageUsers = hasPermission(user.role, "user:manage");
  // Lo que espera a esta persona, siempre a la vista en el menú. Solo se consulta si le toca.
  const pending = canManageUsers ? await countPendingAccounts() : 0;

  // Cada uno ve solo las secciones que su rol permite.
  const seesTeamActivity = hasPermission(user.role, "activity:view");
  const items: NavItem[] = [
    { href: "/", label: "Inicio", match: "exact" },
    { href: "/cables", label: "Cables", match: "prefix" },
    { href: "/trays", label: "Bandejas", match: "prefix" },
    { href: "/equipment", label: "Equipos", match: "prefix" },
    { href: "/locations", label: "Ubicaciones", match: "prefix" },
    // Quien ve la de todos tiene la suya en su menú; el resto, en la fila principal.
    ...(seesTeamActivity
      ? [
          { href: "/activity", label: "Actividad", match: "exact" } as const,
          { href: "/activity/me", label: "Mi actividad", match: "prefix", place: "user" } as const,
        ]
      : [{ href: "/activity/me", label: "Mi actividad", match: "prefix" } as const]),
    ...(hasPermission(user.role, "catalog:manage")
      ? [{ href: "/catalogs", label: "Catálogos", match: "prefix", place: "manage" } as const]
      : []),
    ...(canManageUsers
      ? [
          {
            href: "/admin/users",
            label: "Usuarios",
            match: "prefix",
            place: "manage",
            badge: {
              count: pending,
              label:
                pending === 1 ? "cuenta pendiente de aprobar" : "cuentas pendientes de aprobar",
            },
          } as const,
        ]
      : []),
  ];

  return (
    <div className="min-h-dvh">
      <AppHeader items={items} user={{ name: user.name, role: ROLE_LABELS[user.role] }} />
      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
