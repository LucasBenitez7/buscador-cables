import type { Metadata } from "next";
import Link from "next/link";
import {
  CABLE_FIELD_ACTIONS,
  canRunCableAction,
  hasPermission,
  parseCableSearch,
} from "@cables/shared";
import { Button } from "@/components/ui/button";
import { SearchFilters } from "@/features/search/components/search-filters";
import { SearchResults } from "@/features/search/components/search-results";
import { deletedCableCode } from "@/lib/route-params";
import { getSearchOptions, searchCables } from "@/server/cables/search";
import { listLocationOptions } from "@/server/cables/service";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Cables" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CablesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await searchParams;
  const search = parseCableSearch(params);
  // Solo un código de cable: cualquier otro texto de la URL saldría dentro de un aviso.
  const deleted = deletedCableCode(params.deleted);
  // Solo quien puede registrar alguna acción ve la columna "Acción" (los VIEWER, no).
  const canAct = CABLE_FIELD_ACTIONS.some((action) => canRunCableAction(user.role, action));
  const [result, options, locations] = await Promise.all([
    searchCables(search),
    getSearchOptions(),
    canAct ? listLocationOptions() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Cables</h1>
        {hasPermission(user.role, "cable:create") ? (
          <Button asChild>
            <Link href="/cables/new">Nuevo cable</Link>
          </Button>
        ) : null}
      </div>

      {deleted ? (
        <p role="status" className="bg-muted rounded-md px-3 py-2 text-sm">
          Cable {deleted} dado de baja.
        </p>
      ) : null}

      <SearchFilters search={search} options={options} />
      <SearchResults
        search={search}
        result={result}
        actions={canAct ? { role: user.role, locations } : undefined}
      />
    </div>
  );
}
