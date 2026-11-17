import type { CableHistorySearch } from "@cables/shared";

/**
 * Cuántos movimientos cumplen los filtros del historial. Solo aparece cuando la persona ha
 * puesto un filtro: el origen por defecto («En campo») no cuenta. Sin filtros no dice nada.
 */
export function HistoryFilterNote({
  search,
  total,
  all,
}: {
  search: CableHistorySearch;
  total: number;
  all: number;
}) {
  const filtered = (search.origin && search.origin !== "people") || search.action || search.person;
  if (!filtered) return null;
  return (
    <p role="status" className="text-muted-foreground text-sm">
      {`${total} de ${all} movimientos cumplen los filtros.`}
    </p>
  );
}
