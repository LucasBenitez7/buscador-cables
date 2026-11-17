import type { Metadata } from "next";
import Link from "next/link";
import { ROLE_PERMISSIONS } from "@cables/shared";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RoleEditor } from "@/features/roles/components/role-editor";
import { INLINE_LINK } from "@/lib/links";
import { getRole, listRoles } from "@/server/roles/service";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Crear rol" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** A new role, starting from a copy of another one (Consulta by default). */
export default async function NewRolePage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission("role:manage");
  const copy = (await searchParams).copiar;
  const [roles, source] = await Promise.all([
    listRoles(),
    typeof copy === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(copy) ? getRole(copy) : null,
  ]);
  // Nunca se copian los permisos de administración: el formulario no los ofrece.
  const start = source
    ? source.permissions.filter(
        (permission) => permission !== "user:manage" && permission !== "role:manage",
      )
    : [...ROLE_PERMISSIONS.VIEWER];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-muted-foreground text-sm">
          <Link href="/admin/roles" className={INLINE_LINK}>
            Roles y permisos
          </Link>{" "}
          ›
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Crear rol</h1>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
        <div className="space-y-1.5">
          <Label htmlFor="copiar">Empezar copiando</Label>
          <NativeSelect id="copiar" name="copiar" defaultValue={source?.id ?? ""}>
            <option value="">Consulta (lo mínimo)</option>
            {roles
              .filter((role) => !role.locked)
              .map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline" size="sm">
          Copiar
        </Button>
      </form>

      <RoleEditor
        key={source?.id ?? "nuevo"}
        role={{
          name: source ? `${source.name} (copia)` : "",
          description: source?.description ?? null,
          permissions: start,
        }}
      />
    </div>
  );
}
