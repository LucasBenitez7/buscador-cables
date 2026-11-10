import Link from "next/link";
import {
  CABLE_ACTION_LABELS,
  CONNECTION_STATUS_LABELS,
  INSTALLATION_STATUS_LABELS,
  cableSearchQuery,
  effectiveSort,
  formatDecimal,
  type CableSearch,
  type CableSort,
} from "@cables/shared";
import type { CableSearchResult } from "@/server/cables/search";

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

type Props = { search: CableSearch; result: CableSearchResult };

/** Tabla de resultados. Ordenación y paginación son enlaces: todo vive en la URL. */
export function SearchResults({ search, result }: Props) {
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
          className="hover:text-foreground inline-flex items-center gap-1"
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
      <p role="status" className="text-muted-foreground text-sm">
        {result.total.toLocaleString("es-ES")} {result.total === 1 ? "cable" : "cables"}
        {result.pageCount > 1 ? ` · página ${result.page} de ${result.pageCount}` : ""}
      </p>

      <div className="overflow-x-auto rounded-lg border">
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
              {header("Último movimiento", "updated", "hidden md:table-cell")}
            </tr>
          </thead>
          <tbody>
            {result.items.map((cable) => (
              <tr key={cable.id} className="border-t align-top">
                <td className="px-3 py-2 font-mono font-medium whitespace-nowrap">
                  <Link href={`/cables/${cable.id}`} className="underline-offset-4 hover:underline">
                    {cable.code}
                  </Link>
                </td>
                <td className="hidden px-3 py-2 md:table-cell">
                  <span className="inline-flex items-center gap-1.5">
                    {cable.color ? (
                      <span
                        aria-hidden
                        title={cable.color.name}
                        className="size-3 shrink-0 rounded-full border"
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
                  {INSTALLATION_STATUS_LABELS[cable.installationStatus]}
                  <span className="text-muted-foreground block text-xs">
                    {CONNECTION_STATUS_LABELS[cable.connectionStatus]}
                  </span>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.pageCount > 1 ? (
        <nav aria-label="Paginación" className="flex items-center justify-between gap-3 text-sm">
          {result.page > 1 ? (
            <Link href={`/cables${cableSearchQuery(search, { page: result.page - 1 })}`} rel="prev">
              ← Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Página {result.page} de {result.pageCount}
          </span>
          {result.page < result.pageCount ? (
            <Link href={`/cables${cableSearchQuery(search, { page: result.page + 1 })}`} rel="next">
              Siguiente →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
