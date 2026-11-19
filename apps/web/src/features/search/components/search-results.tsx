import Link from "next/link";
import {
  cableActionAvailability,
  cableSearchQuery,
  effectiveSort,
  formatDecimal,
  SEARCH_PAGE_SIZES,
  type CableSearch,
  type CableSort,
} from "@cables/shared";
import { ListSummary } from "@/components/list-summary";
import { PageSizePicker } from "@/components/page-size-picker";
import { Pagination } from "@/components/pagination";
import {
  SelectAllRow,
  SelectCell,
  SelectCheckbox,
  SelectHeaderCell,
  SelectionAside,
} from "@/components/selection";
import { PendingLink } from "@/components/pending-list";
import { CODE_LINK } from "@/components/ui/text-link";
import { CableActions } from "@/features/cables/components/cable-actions";
import { trayHref } from "@/features/cables/components/cable-route";
import { CableStatusBadges } from "@/features/cables/components/cable-status-badges";
import { EquipmentLink } from "@/features/cables/components/equipment-link";
import { INLINE_LINK, locationHref } from "@/lib/links";
import type { CableSearchItem, CableSearchResult } from "@/server/cables/search";

type Props = {
  search: CableSearch;
  result: CableSearchResult;
  /** When set, each row gets an "Acción" button for what this person can do. */
  actions?: { permissions: readonly string[] };
};

/** Tabla de resultados. Ordenación y paginación son enlaces: todo vive en la URL. */
export function SearchResults({ search, result, actions }: Props) {
  const { sort, dir } = effectiveSort(search);

  if (result.total === 0) {
    return (
      <p role="status" className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
        No hay cables que cumplan estos filtros.
      </p>
    );
  }

  const header = (label: string, key: CableSort, className = "") => {
    const active = sort === key;
    const nextDir = active && dir === "asc" ? "desc" : "asc";
    return (
      <th
        scope="col"
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}
        className={`px-3 py-2 font-medium ${className}`}
      >
        <PendingLink
          href={`/cables${cableSearchQuery(search, { sort: key, dir: nextDir, page: undefined })}`}
          className="hover:text-foreground focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded-sm outline-none focus-visible:ring-3"
        >
          {label}
          <span aria-hidden className="text-xs">
            {active ? (dir === "asc" ? "▲" : "▼") : ""}
          </span>
        </PendingLink>
      </th>
    );
  };

  return (
    <div className="space-y-3">
      {result.fuzzy ? (
        <p className="bg-muted rounded-md px-3 py-2 text-sm">
          Ningún código contiene «{search.q}». Se muestran los códigos más parecidos.
        </p>
      ) : null}
      <ListSummary
        aside={
          <SelectionAside>
            {result.total > SEARCH_PAGE_SIZES[0] ? (
              <PageSizePicker
                sizes={SEARCH_PAGE_SIZES}
                size={search.size}
                page={result.page}
                href={(size, page) => `/cables${cableSearchQuery(search, { size, page })}`}
              />
            ) : null}
          </SelectionAside>
        }
      >
        <span className="text-foreground font-medium">{result.total.toLocaleString("es-ES")}</span>{" "}
        {result.total === 1 ? "cable" : "cables"}
        {result.pageCount > 1 ? ` · página ${result.page} de ${result.pageCount}` : ""}
      </ListSummary>

      {/* Móvil: tarjetas, más fáciles de leer y de pulsar que una tabla estrecha. */}
      <SelectAllRow />
      <ul className="space-y-3 md:hidden">
        {result.items.map((cable) => (
          <li key={cable.id} className="bg-card space-y-2 rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <SelectCheckbox item={{ key: cable.id, label: cable.code }} />
                <Link
                  href={`/cables/${cable.id}`}
                  className={`${CODE_LINK} -m-1 rounded-md p-1 text-base font-semibold`}
                >
                  {cable.code}
                </Link>
              </div>
              <CableStatusBadges
                installationStatus={cable.installationStatus}
                connectionStatus={cable.connectionStatus}
                testStatus={cable.testStatus}
              />
            </div>
            <Ends cable={cable} />
            <LooseEnd cable={cable} />
            {actions ? (
              <div className="flex justify-end border-t pt-2">
                <CableActions
                  compact
                  cableId={cable.id}
                  code={cable.code}
                  version={cable.version}
                  state={cable.state}
                  availability={cableActionAvailability(actions, cable.state)}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-muted-foreground text-xs tracking-wide uppercase">
            <tr>
              <SelectHeaderCell />
              {header("Código", "code")}
              <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">
                Tipo
              </th>
              {header("Sección", "section", "hidden lg:table-cell")}
              {header("Longitud", "length", "hidden lg:table-cell")}
              <th scope="col" className="px-3 py-2 font-medium">
                Origen / destino
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Estado
              </th>
              {actions ? (
                <th scope="col" className="px-3 py-2 font-medium">
                  <span className="sr-only">Acción</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {result.items.map((cable) => (
              <tr key={cable.id} className="hover:bg-muted/40 border-t align-top transition-colors">
                <SelectCell item={{ key: cable.id, label: cable.code }} />
                <td className="px-3 py-2 font-mono font-medium whitespace-nowrap">
                  <Link href={`/cables/${cable.id}`} className={CODE_LINK}>
                    {cable.code}
                  </Link>
                </td>
                <td className="hidden px-3 py-2 md:table-cell">
                  <span className="inline-flex items-center gap-1.5">
                    {cable.color ? (
                      <span
                        aria-hidden
                        title={cable.color.name}
                        className="border-foreground/40 size-3 shrink-0 rounded-full border"
                        style={{ backgroundColor: cable.color.hex ?? "transparent" }}
                      />
                    ) : null}
                    {cable.type ?? "—"}
                  </span>
                </td>
                <td className="hidden px-3 py-2 whitespace-nowrap lg:table-cell">
                  {cable.crossSectionMm2 === null
                    ? "—"
                    : `${cable.conductors ? `${cable.conductors}×` : ""}${formatDecimal(cable.crossSectionMm2)} mm²`}
                </td>
                <td className="hidden px-3 py-2 whitespace-nowrap lg:table-cell">
                  {cable.lengthM === null ? "—" : `${formatDecimal(cable.lengthM)} m`}
                </td>
                <td className="px-3 py-2">
                  <Ends cable={cable} />
                </td>
                <td className="px-3 py-2">
                  <CableStatusBadges
                    installationStatus={cable.installationStatus}
                    connectionStatus={cable.connectionStatus}
                    testStatus={cable.testStatus}
                  />
                  <LooseEnd cable={cable} />
                </td>
                {actions ? (
                  <td className="px-3 py-2">
                    <CableActions
                      compact
                      cableId={cable.id}
                      code={cable.code}
                      version={cable.version}
                      state={cable.state}
                      availability={cableActionAvailability(actions, cable.state)}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        href={(page) => `/cables${cableSearchQuery(search, { page })}`}
      />
    </div>
  );
}

/**
 * Origin → destination: the equipment when the project lists give it (what people look for
 * in the field), with the room or location below; otherwise the location.
 */
function Ends({ cable }: { cable: CableSearchItem }) {
  const rows = [
    ["Origen", cable.originEquipment, cable.origin, cable.originLocationId],
    ["Destino", cable.destinationEquipment, cable.destination, cable.destinationLocationId],
  ] as const;
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1">
      {rows.map(([label, equipment, location, locationId]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground text-[0.65rem] font-medium tracking-wide uppercase">
            {label}
          </dt>
          <dd className="min-w-0">
            {equipment ? <EquipmentLink equipment={equipment} className="font-medium" /> : null}
            {location ? (
              <span className={equipment ? "text-muted-foreground block text-xs" : "block"}>
                {locationId ? (
                  <Link href={locationHref(locationId)} className={INLINE_LINK}>
                    {location}
                  </Link>
                ) : (
                  location
                )}
              </span>
            ) : null}
            {!equipment && !location ? <span className="text-muted-foreground">—</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Where the loose end of a partially laid cable waits. */
function LooseEnd({ cable }: { cable: CableSearchItem }) {
  const { looseEnd, looseEndTray } = cable.state;
  if (!looseEnd || !looseEndTray) return null;
  return (
    <p className="text-warning mt-1 text-xs">
      Punta de {looseEnd === "ORIGIN" ? "origen" : "destino"} en{" "}
      <Link href={trayHref(looseEndTray)} className="font-mono underline underline-offset-2">
        {looseEndTray}
      </Link>
    </p>
  );
}

/**
 * Straight to the wiring tab of the cable (wires, terminals and the original sheet): who
 * connects does not have to open the record and change tab.
 */
