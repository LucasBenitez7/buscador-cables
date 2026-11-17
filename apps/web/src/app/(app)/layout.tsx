import { Suspense, type ReactNode } from "react";
import { hasPermission } from "@cables/shared";
import { NavigationProgress } from "@/components/navigation-progress";
import { AppHeader } from "@/features/navigation/app-header";
import type { NavItem } from "@/features/navigation/nav-items";
import { requireUser } from "@/server/session";
import { countPendingAccounts } from "@/server/users/service";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Comprobación real en servidor. El proxy solo mira si existe la cookie.
  const user = await requireUser();
  const canManageUsers = hasPermission(user, "user:manage");
  // Lo que espera a esta persona, siempre a la vista en el menú. Solo se consulta si le toca.
  const pending = canManageUsers ? await countPendingAccounts() : 0;

  // Cada uno ve solo las secciones que su rol permite.
  const seesTeamActivity = hasPermission(user, "activity:view");
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
    ...(hasPermission(user, "catalog:manage")
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
    ...(hasPermission(user, "role:manage")
      ? [
          {
            href: "/admin/roles",
            label: "Roles y permisos",
            match: "prefix",
            place: "manage",
          } as const,
        ]
      : []),
  ];

  return (
    <div className="min-h-dvh">
      {/* Lee la URL (useSearchParams): fuera del primer render del servidor. */}
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <AppHeader
        items={items}
        user={{
          name: user.name,
          role: user.extraCount > 0 ? `${user.roleName} +${user.extraCount}` : user.roleName,
        }}
      />
      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
