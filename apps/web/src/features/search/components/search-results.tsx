import Link from "next/link";
import {
  CABLE_ACTION_LABELS,
  cableActionAvailability,
  cableSearchQuery,
  effectiveSort,
  formatDecimal,
  type CableSearch,
  type CableSort,
  type Role,
} from "@cables/shared";
import { Button } from "@/components/ui/button";
import { CableActions, type ActionOption } from "@/features/cables/components/cable-actions";
import { CableStatusBadges } from "@/features/cables/components/cable-status-badges";
import type { CableSearchResult } from "@/server/cables/search";

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

type Props = {
  search: CableSearch;
  result: CableSearchResult;
  /** When set, each row gets an "Acción" button for what this role can do. */
  actions?: { role: Role; locations: ActionOption[] };
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
        <Link
          href={`/cables${cableSearchQuery(search, { sort: key, dir: nextDir, page: undefined })}`}
          className="hover:text-foreground focus-visible:ring-ring/50 inline-flex items-center gap-1 rounded-sm outline-none focus-visible:ring-3"
        >
          {label}
          <span aria-hidden className="text-xs">
            {active ? (dir === "asc" ? "▲" : "▼") : ""}
          </span>
        </Link>
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
      <p role="status" className="text-muted-foreground text-sm">
        {result.total.toLocaleString("es-ES")} {result.total === 1 ? "cable" : "cables"}
        {result.pageCount > 1 ? ` · página ${result.page} de ${result.pageCount}` : ""}
      </p>

      {/* Móvil: tarjetas, más fáciles de leer y de pulsar que una tabla estrecha. */}
      <ul className="space-y-3 md:hidden">
        {result.items.map((cable) => (
          <li key={cable.id} className="bg-card space-y-2 rounded-lg border p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <Link
                href={`/cables/${cable.id}`}
                className="hover:text-primary active:text-primary focus-visible:ring-ring/50 -m-1 rounded-md p-1 font-mono text-base font-semibold outline-none focus-visible:ring-3"
              >
                {cable.code}
              </Link>
              <CableStatusBadges
                installationStatus={cable.installationStatus}
                connectionStatus={cable.connectionStatus}
              />
            </div>
            <p>
              {cable.origin ?? "—"} → {cable.destination ?? "—"}
            </p>
            <p className="text-muted-foreground inline-flex items-center gap-1.5">
              {cable.color ? (
                <span
                  aria-hidden
                  className="border-foreground/40 size-3 shrink-0 rounded-full border"
                  style={{ backgroundColor: cable.color.hex ?? "transparent" }}
                />
              ) : null}
              {[
                cable.type,
                cable.crossSectionMm2 === null
                  ? null
                  : `${cable.conductors ? `${cable.conductors}×` : ""}${formatDecimal(cable.crossSectionMm2)} mm²`,
                cable.lengthM === null ? null : `${formatDecimal(cable.lengthM)} m`,
              ]
                .filter(Boolean)
                .join(" · ") || "Sin datos técnicos"}
            </p>
            <div className="flex items-end justify-between gap-3 border-t pt-2">
              <p className="text-muted-foreground text-xs">
                {cable.lastAction ? (
                  <>
                    <span className="text-foreground">{CABLE_ACTION_LABELS[cable.lastAction]}</span>
                    {cable.lastActionBy ? ` · ${cable.lastActionBy}` : ""}
                    {cable.lastActionAt ? ` · ${dateFormat.format(cable.lastActionAt)}` : ""}
                  </>
                ) : (
                  "Sin movimientos"
                )}
              </p>
              {actions ? (
                <CableActions
                  compact
                  cableId={cable.id}
                  code={cable.code}
                  version={cable.version}
                  state={cable.state}
                  availability={cableActionAvailability(actions.role, cable.state)}
                  locations={actions.locations}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              {header("Código", "code")}
              <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">
                Tipo
              </th>
              {header("Sección", "section", "hidden lg:table-cell")}
              {header("Longitud", "length", "hidden lg:table-cell")}
              <th scope="col" className="px-3 py-2 font-medium">
                Origen → destino
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Estado
              </th>
              {header("Último movimiento", "activity", "hidden md:table-cell")}
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
                <td className="px-3 py-2 font-mono font-medium whitespace-nowrap">
                  <Link
                    href={`/cables/${cable.id}`}
                    className="hover:text-primary focus-visible:ring-ring/50 rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3"
                  >
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
                  {cable.origin ?? "—"} → {cable.destination ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <CableStatusBadges
                    installationStatus={cable.installationStatus}
                    connectionStatus={cable.connectionStatus}
                  />
                </td>
                <td className="hidden px-3 py-2 md:table-cell">
                  {cable.lastAction ? (
                    <>
                      {CABLE_ACTION_LABELS[cable.lastAction]}
                      <span className="text-muted-foreground block text-xs">
                        {cable.lastActionBy ?? "—"}
                        {cable.lastActionAt ? ` · ${dateFormat.format(cable.lastActionAt)}` : ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                {actions ? (
                  <td className="px-3 py-2">
                    <CableActions
                      compact
                      cableId={cable.id}
                      code={cable.code}
                      version={cable.version}
                      state={cable.state}
                      availability={cableActionAvailability(actions.role, cable.state)}
                      locations={actions.locations}
                    />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.pageCount > 1 ? (
        <nav aria-label="Paginación" className="flex items-center justify-between gap-3 text-sm">
          {result.page > 1 ? (
            <Button asChild variant="outline">
              <Link
                href={`/cables${cableSearchQuery(search, { page: result.page - 1 })}`}
                rel="prev"
              >
                ← Anterior
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Página {result.page} de {result.pageCount}
          </span>
          {result.page < result.pageCount ? (
            <Button asChild variant="outline">
              <Link
                href={`/cables${cableSearchQuery(search, { page: result.page + 1 })}`}
                rel="next"
              >
                Siguiente →
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
