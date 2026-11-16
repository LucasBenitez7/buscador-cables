import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PERMISSION_LABELS, hasPermission } from "@cables/shared";
import { Section } from "@/components/detail";
import { GrantsEditor } from "@/features/roles/components/grants-editor";
import { INLINE_LINK } from "@/lib/links";
import { getUserPermissions } from "@/server/roles/service";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Persona" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

/**
 * One person: what they can do and where it comes from (their role or an extra), and, for who
 * manages roles, their extra permissions to change.
 */
export default async function UserPage({ params }: { params: Params }) {
  const current = await requirePermission("user:manage");
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const person = await getUserPermissions(id);
  if (!person) notFound();
  const canEditGrants = hasPermission(current, "role:manage");

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <p className="text-muted-foreground text-sm">
          <Link href="/admin/users" className={INLINE_LINK}>
            Usuarios
          </Link>{" "}
          ›
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{person.name}</h1>
        <p className="text-muted-foreground text-sm">
          {person.email} · Rol{" "}
          {canEditGrants ? (
            <Link href={`/admin/roles/${person.role.id}`} className={INLINE_LINK}>
              {person.role.name}
            </Link>
          ) : (
            person.role.name
          )}
          {person.extras.length > 0 ? ` +${person.extras.length} extra` : ""}
        </p>
      </div>

      <Section title={`Lo que puede hacer (${person.effective.length})`} collapsible id="puede">
        <ul className="bg-card divide-y rounded-lg border text-sm">
          {person.effective.map((permission) => (
            <li key={permission} className="flex flex-wrap justify-between gap-2 px-4 py-2">
              <span>{PERMISSION_LABELS[permission]}</span>
              <span
                className={
                  person.extras.includes(permission)
                    ? "text-primary text-xs font-semibold"
                    : "text-muted-foreground text-xs"
                }
              >
                {person.extras.includes(permission) ? "Extra" : "Por su rol"}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {canEditGrants ? (
        <Section title="Permisos extra" collapsible id="extras">
          <p className="text-muted-foreground text-sm">
            Solo para esta persona, además de su rol. La gestión de cuentas y de roles no se da como
            extra: es del rol Administrador.
          </p>
          <GrantsEditor
            userId={person.id}
            roleName={person.role.name}
            rolePermissions={person.role.permissions}
            extras={person.extras}
          />
        </Section>
      ) : null}
    </div>
  );
}
