import type { Metadata } from "next";
import {
  hasPermission,
  USER_SORT_LABELS,
  USER_STATUS_LABELS,
  listQuery,
  optionsOf,
  parseUserListSearch,
  type UserListSearch,
} from "@cables/shared";
import { FilterForm } from "@/components/filter-form";
import { Pagination } from "@/components/pagination";
import { CreateUserForm } from "@/features/users/components/create-user-form";
import { RoleGuide } from "@/features/users/components/role-guide";
import { UserEvents } from "@/features/users/components/user-events";
import { UsersTable } from "@/features/users/components/users-table";
import { requirePermission } from "@/server/session";
import { listRoles } from "@/server/roles/service";
import { countPendingAccounts, listUserEvents, searchUsers } from "@/server/users/service";

export const metadata: Metadata = { title: "Usuarios" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const pageHref = (search: UserListSearch, page: number) =>
  `/admin/users${listQuery({ ...search, page }, { page: 1, sort: "priority" })}`;

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const current = await requirePermission("user:manage");
  const search = parseUserListSearch(await searchParams);
  const [users, events, pendingCount, roles] = await Promise.all([
    searchUsers(search),
    listUserEvents(10),
    countPendingAccounts(),
    listRoles(),
  ]);
  const filtered = Boolean(search.q || search.role || search.status || search.sort);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
        <p className="text-muted-foreground text-sm">
          Cualquiera puede pedir una cuenta con su correo y contraseña, pero no entra hasta que la
          apruebas aquí eligiendo su rol. Desde aquí también se cambian los roles, se desactivan
          cuentas y se dan de alta usuarios directamente.
        </p>
      </div>

      {pendingCount > 0 ? (
        <p role="status" className="border-warning/50 rounded-lg border px-4 py-3 text-sm">
          {pendingCount === 1
            ? "Hay 1 cuenta pendiente de aprobación."
            : `Hay ${pendingCount} cuentas pendientes de aprobación.`}{" "}
          Elige su rol y apruébalas solo si conoces a la persona.
        </p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-base font-medium">
              Cuentas ({users.total.toLocaleString("es-ES")})
              {users.pageCount > 1 ? (
                <span className="text-muted-foreground text-sm font-normal">
                  {" "}
                  · página {users.page} de {users.pageCount}
                </span>
              ) : null}
            </h2>
            <FilterForm
              action="/admin/users"
              label="Filtrar cuentas"
              active={filtered}
              fields={[
                {
                  kind: "text",
                  name: "q",
                  label: "Nombre o correo",
                  value: search.q,
                  placeholder: "Ana, @empresa…",
                },
                {
                  kind: "select",
                  name: "role",
                  label: "Rol",
                  value: search.role,
                  options: roles.map((role) => ({ value: role.id, label: role.name })),
                },
                {
                  kind: "select",
                  name: "status",
                  label: "Estado",
                  value: search.status,
                  options: optionsOf(USER_STATUS_LABELS),
                  emptyLabel: "Todas",
                },
                {
                  kind: "select",
                  name: "sort",
                  label: "Orden",
                  value: search.sort,
                  options: optionsOf(USER_SORT_LABELS),
                  emptyLabel: null,
                },
              ]}
            />
            {users.rows.length === 0 ? (
              <p role="status" className="text-muted-foreground rounded-lg border p-4 text-sm">
                Ninguna cuenta cumple estos filtros.
              </p>
            ) : (
              <UsersTable users={users.rows} currentUserId={current.id} roles={roles} />
            )}
            <Pagination
              page={users.page}
              pageCount={users.pageCount}
              href={(page) => pageHref(search, page)}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-medium">Dar de alta un usuario</h2>
            <CreateUserForm roles={roles} />
          </section>

          <UserEvents events={events} />
        </div>

        {/* Siempre a la vista: en el escritorio se queda fija al bajar por la página. */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <RoleGuide roles={roles} canEdit={hasPermission(current, "role:manage")} />
        </aside>
      </div>
    </div>
  );
}
