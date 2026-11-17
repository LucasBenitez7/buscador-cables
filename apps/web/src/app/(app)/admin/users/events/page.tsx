import type { Metadata } from "next";
import Link from "next/link";
import {
  DATE_SORT_LABELS,
  USER_EVENT_ACTION_LABELS,
  listQuery,
  optionsOf,
  parseUserEventSearch,
  type UserEventSearch,
} from "@cables/shared";
import { FilterForm } from "@/components/filter-form";
import { Pagination } from "@/components/pagination";
import { PendingListProvider, PendingResults } from "@/components/pending-list";
import { UserEventList } from "@/features/users/components/user-events";
import { INLINE_LINK } from "@/lib/links";
import { requirePermission } from "@/server/session";
import { listUserOptions, searchUserEvents } from "@/server/users/service";

export const metadata: Metadata = { title: "Cambios en las cuentas" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const pageHref = (search: UserEventSearch, page: number) =>
  `/admin/users/events${listQuery({ ...search, page }, { page: 1, sort: "newest" })}`;

/** Every change to the accounts (audit), with filters: what, who and when. */
export default async function UserEventsPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission("user:manage");
  const search = parseUserEventSearch(await searchParams);
  const [events, people] = await Promise.all([searchUserEvents(search), listUserOptions()]);
  const filtered = Boolean(
    search.action || search.person || search.from || search.to || search.sort,
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-muted-foreground text-sm">
          <Link href="/admin/users" className={INLINE_LINK}>
            Usuarios
          </Link>{" "}
          ›
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Cambios en las cuentas</h1>
        <p className="text-muted-foreground text-sm">
          Quién dio de alta, aprobó, cambió de rol, desactivó o reactivó a quién. No se pueden
          editar ni borrar.
        </p>
      </div>

      <PendingListProvider>
        <FilterForm
          action="/admin/users/events"
          label="Filtrar cambios"
          active={filtered}
          fields={[
            {
              kind: "select",
              name: "action",
              label: "Qué cambió",
              value: search.action,
              options: optionsOf(USER_EVENT_ACTION_LABELS),
            },
            {
              kind: "select",
              name: "person",
              label: "Persona (lo hizo o lo recibió)",
              value: search.person,
              options: people.map((person) => ({ value: person.id, label: person.label })),
              emptyLabel: "Todas",
            },
            { kind: "date", name: "from", label: "Desde", value: search.from },
            { kind: "date", name: "to", label: "Hasta", value: search.to },
            {
              kind: "select",
              name: "sort",
              label: "Orden",
              value: search.sort,
              options: optionsOf(DATE_SORT_LABELS),
              emptyLabel: null,
            },
          ]}
        />

        <PendingResults className="space-y-6">
          <p role="status" className="text-muted-foreground text-sm">
            <span className="text-foreground font-medium">
              {events.total.toLocaleString("es-ES")}
            </span>{" "}
            {events.total === 1 ? "cambio" : "cambios"}
            {events.pageCount > 1 ? ` · página ${events.page} de ${events.pageCount}` : ""}
          </p>
          <UserEventList events={events.rows} />
          <Pagination
            page={events.page}
            pageCount={events.pageCount}
            href={(page) => pageHref(search, page)}
          />
        </PendingResults>
      </PendingListProvider>
    </div>
  );
}
