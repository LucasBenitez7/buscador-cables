import type { Metadata } from "next";
import Link from "next/link";
import { EQUIPMENT_LIST_SORT_LABELS, optionsOf, parseEquipmentListSearch } from "@cables/shared";
import { ListToolbar } from "@/components/list-toolbar";
import { PendingListProvider, PendingResults } from "@/components/pending-list";
import {
  SelectAllRow,
  SelectCheckbox,
  SelectionAside,
  SelectionProvider,
} from "@/components/selection";
import { equipmentHref } from "@/lib/links";
import { EQUIPMENT_MAX, searchEquipment } from "@/server/equipment/service";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Equipos" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Find a cabinet, box or panel to see every cable that lands in it (fase 11). */
export default async function EquipmentSearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireUser();
  const search = parseEquipmentListSearch(await searchParams);
  const query = search.q ?? "";
  const sort = search.sort ?? "cables";
  const matches = await searchEquipment(query, sort);
  // Lo que se muestra por defecto no cuenta como «puesto»: Limpiar solo si hay algo más.
  const active = Boolean(query || (search.sort && search.sort !== "cables"));

  const count = query
    ? matches.length === 0
      ? "Ningún equipo contiene ese código."
      : `${matches.length} ${matches.length === 1 ? "equipo" : "equipos"}${matches.length >= 60 ? " (los 60 con más cables; afina la búsqueda)" : ""}`
    : "Los equipos con más cables. Escribe un código para buscar uno.";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Equipos</h1>
        <p className="text-muted-foreground text-sm">
          Cuadros, cajas y armarios: cada uno con los cables que llegan a él, por regletero, y si
          esa punta está conectada.
        </p>
      </div>

      <PendingListProvider>
        <SelectionProvider
          title="Equipos"
          items={matches.map((match) => ({ key: match.equipment, label: match.equipment }))}
          resetKey={`${query}|${sort}`}
        >
          <ListToolbar
            action="/equipment"
            label="Buscar equipos"
            search={{
              name: "q",
              label: "Código del equipo",
              value: query,
              placeholder: "99BMA10, 99CXJ…",
              mono: true,
              maxLength: EQUIPMENT_MAX,
            }}
            sort={{
              name: "sort",
              value: sort,
              defaultValue: "cables",
              options: optionsOf(EQUIPMENT_LIST_SORT_LABELS),
            }}
            active={active}
            count={count}
            countAside={matches.length > 0 ? <SelectionAside /> : null}
          />

          <PendingResults className="space-y-3">
            <SelectAllRow />
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {matches.map((match) => (
                <li
                  key={match.equipment}
                  className="bg-card hover:border-primary/50 hover:bg-muted/40 has-focus-visible:ring-ring/50 relative space-y-1 rounded-lg border p-3 text-sm transition-colors has-focus-visible:ring-3"
                >
                  <div className="flex items-center gap-2">
                    <SelectCheckbox item={{ key: match.equipment, label: match.equipment }} />
                    <Link
                      href={equipmentHref(match.equipment)}
                      className="text-primary font-mono text-base font-semibold break-all outline-none after:absolute after:inset-0 after:rounded-lg"
                    >
                      {match.equipment}
                    </Link>
                  </div>
                  <p className="text-muted-foreground">
                    {match.cables} {match.cables === 1 ? "cable" : "cables"}
                  </p>
                </li>
              ))}
            </ul>
          </PendingResults>
        </SelectionProvider>
      </PendingListProvider>
    </div>
  );
}
