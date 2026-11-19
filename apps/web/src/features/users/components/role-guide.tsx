import Link from "next/link";
import { PERMISSION_LABELS, type Permission } from "@cables/shared";
import { INLINE_LINK } from "@/lib/links";

export type GuideRole = {
  id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  users: number;
};

/**
 * What each role can do, always in sight on the users page: the administrator chooses a role
 * reading it, when approving an account or changing one. The roles and their permissions are
 * the ones in the database (fase 12), so it never says something the app does not do.
 */
export function RoleGuide({ roles, canEdit }: { roles: GuideRole[]; canEdit: boolean }) {
  return (
    // El título va fuera de la caja, como «Cuentas» a su lado: las dos cajas empiezan a la par.
    <section aria-labelledby="role-guide" className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="role-guide" className="text-base font-medium">
          Qué puede hacer cada rol
        </h2>
        {canEdit ? (
          <Link href="/admin/roles" className={`${INLINE_LINK} text-xs`}>
            Editar roles
          </Link>
        ) : null}
      </div>
      <div className="bg-card space-y-3 rounded-lg border p-4">
        <p className="text-muted-foreground text-xs">
          Da a cada persona el rol que le baste. Si alguien necesita algo más, dale un permiso extra
          desde su ficha (pulsa su nombre).
        </p>
        <dl className="space-y-2">
          {roles.map((role) => (
            <div key={role.id}>
              <details className="group">
                <summary className="hover:text-primary cursor-pointer list-none text-sm [&::-webkit-details-marker]:hidden">
                  <dt className="inline font-semibold">{role.name}</dt>
                  <span className="text-muted-foreground text-xs">
                    {" "}
                    · {role.users} {role.users === 1 ? "persona" : "personas"} ·{" "}
                    {role.permissions.length} permisos
                  </span>
                </summary>
                <dd className="mt-1 space-y-1 text-sm">
                  {role.description ? <p>{role.description}</p> : null}
                  <ul className="text-muted-foreground list-disc space-y-0.5 pl-5 text-xs">
                    {role.permissions.map((permission) => (
                      <li key={permission}>{PERMISSION_LABELS[permission]}</li>
                    ))}
                  </ul>
                </dd>
              </details>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
