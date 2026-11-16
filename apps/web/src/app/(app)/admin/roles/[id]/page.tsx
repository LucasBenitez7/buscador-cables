import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@cables/db";
import { Section } from "@/components/detail";
import { ShowMore } from "@/components/show-more";
import { RoleEditor } from "@/features/roles/components/role-editor";
import { INLINE_LINK } from "@/lib/links";
import { getRole } from "@/server/roles/service";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Rol" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

/** One role: its permissions to edit and the people who have it. */
export default async function RolePage({ params }: { params: Params }) {
  await requirePermission("role:manage");
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) notFound();
  const role = await getRole(id);
  if (!role) notFound();
  const people = await prisma.user.findMany({
    where: { role: role.id },
    select: { id: true, name: true, email: true, active: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <p className="text-muted-foreground text-sm">
          <Link href="/admin/roles" className={INLINE_LINK}>
            Roles y permisos
          </Link>{" "}
          ›
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{role.name}</h1>
        {role.locked ? null : (
          <p className="text-sm">
            <Link href={`/admin/roles/new?copiar=${role.id}`} className={INLINE_LINK}>
              Crear otro rol copiando este
            </Link>
          </p>
        )}
      </div>

      <RoleEditor role={role} />

      <Section title={`Personas con este rol (${people.length})`} collapsible id="personas">
        {people.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nadie tiene este rol.</p>
        ) : (
          <ShowMore
            className="bg-card divide-y rounded-lg border text-sm"
            noun="personas"
            items={people.map((person) => (
              <li key={person.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <Link href={`/admin/users/${person.id}`} className={INLINE_LINK}>
                  {person.name}
                </Link>
                <span className="text-muted-foreground">
                  {person.email}
                  {person.active ? "" : " · desactivada"}
                </span>
              </li>
            ))}
          />
        )}
      </Section>
    </div>
  );
}
