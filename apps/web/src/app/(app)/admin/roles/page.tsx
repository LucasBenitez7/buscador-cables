import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { listRoles } from "@/server/roles/service";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Roles y permisos" };
export const dynamic = "force-dynamic";

/** Every role with how many people have it and how many permissions it gives (admin only). */
export default async function RolesPage() {
  await requirePermission("role:manage");
  const roles = await listRoles();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Roles y permisos</h1>
          <p className="text-muted-foreground max-w-2xl text-sm">
            Qué puede hacer cada rol. Al cambiar un rol, cambia al momento para todas las personas
            que lo tienen. Para una sola persona, dale un permiso extra desde su ficha en Usuarios.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/roles/new">Crear rol</Link>
        </Button>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {roles.map((role) => (
          <li
            key={role.id}
            className="bg-card hover:border-primary/50 has-focus-visible:ring-ring/50 relative space-y-2 rounded-lg border p-4 text-sm transition-colors has-focus-visible:ring-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/admin/roles/${role.id}`}
                className="text-primary text-base font-semibold outline-none after:absolute after:inset-0 after:rounded-lg"
              >
                {role.name}
              </Link>
            </div>
            {role.description ? <p className="text-muted-foreground">{role.description}</p> : null}
            <p>
              {role.users} {role.users === 1 ? "persona" : "personas"} · {role.permissions.length}{" "}
              permisos
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
