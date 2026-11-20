import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PERMISSION_LABELS, hasPermission } from "@cables/shared";
import { Section } from "@/components/detail";
import { GrantsEditor } from "@/features/roles/components/grants-editor";
import { UserEventList } from "@/features/users/components/user-events";
import { INLINE_LINK } from "@/lib/links";
import { getUserPermissions } from "@/server/roles/service";
import { requirePermission } from "@/server/session";
import { getUserProfile } from "@/server/users/service";

const dayFormat = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeZone: "Europe/Madrid",
});
const momentFormat = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

export const metadata: Metadata = { title: "Persona" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

/**
 * One person: who they are (name, email, state), their field actions and account changes, what
 * they can do and where it comes from (their role or an extra), and, for who manages roles,
 * their extra permissions to change. Their name is only shown: only they change it.
 */
export default async function UserPage({ params }: { params: Params }) {
  const current = await requirePermission("user:manage");
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  const [person, profile] = await Promise.all([getUserPermissions(id), getUserProfile(id)]);
  if (!person || !profile) notFound();
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
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{person.name}</h1>
          <span
            className={
              profile.active
                ? "text-success text-sm"
                : profile.pending
                  ? "text-warning text-sm"
                  : "text-muted-foreground text-sm"
            }
          >
            {profile.active
              ? "Activo"
              : profile.pending
                ? "Pendiente de aprobación"
                : "Desactivado"}
          </span>
        </div>
        <p className="text-muted-foreground text-sm">
          {person.email} · Rol{" "}
          {canEditGrants ? (
            <Link href={`/admin/roles/${person.role.id}`} className={INLINE_LINK}>
              {person.role.name}
            </Link>
          ) : (
            person.role.name
          )}
          {person.extras.length > 0 ? ` +${person.extras.length} extra` : ""} · Alta el{" "}
          {dayFormat.format(profile.createdAt)}
        </p>
      </div>

      <div className="grid items-start gap-4 md:grid-cols-2">
        <section aria-labelledby="actividad" className="bg-card space-y-2 rounded-lg border p-4">
          <h2 id="actividad" className="text-base font-medium">
            Actividad
          </h2>
          <p className="text-sm">
            {profile.activity.total === 0
              ? "Todavía no ha registrado movimientos."
              : `${profile.activity.total} ${profile.activity.total === 1 ? "movimiento" : "movimientos"}${
                  profile.activity.lastAt
                    ? ` · el último el ${momentFormat.format(profile.activity.lastAt)}`
                    : ""
                }`}
          </p>
          <Link href={`/activity?actor=${person.id}`} className={`${INLINE_LINK} text-sm`}>
            Ver su actividad
          </Link>
        </section>

        <section aria-labelledby="cambios" className="bg-card space-y-2 rounded-lg border p-4">
          <h2 id="cambios" className="text-base font-medium">
            Cambios de la cuenta
          </h2>
          {profile.events.length === 0 ? (
            <p className="text-muted-foreground text-sm">Todavía no hay cambios registrados.</p>
          ) : (
            <UserEventList events={profile.events} />
          )}
          <Link
            href={`/admin/users/events?person=${person.id}`}
            className={`${INLINE_LINK} text-sm`}
          >
            Ver todos sus cambios
          </Link>
        </section>
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
