import type { Metadata } from "next";
import Link from "next/link";
import {
  CABLE_FIELD_ACTIONS,
  canRunCableAction,
  hasPermission,
  cableSearchQuery,
  parseCableSearch,
} from "@cables/shared";
import { PendingListProvider, PendingResults } from "@/components/pending-list";
import { SelectionProvider } from "@/components/selection";
import { Button } from "@/components/ui/button";
import { SearchFilters } from "@/features/search/components/search-filters";
import { ReelNotice } from "@/features/meters/components/reel-notice";
import { SaveChosenButton } from "@/features/saved/components/save-dialog";
import { selectAllCablesAction } from "@/features/search/actions";
import { SearchResults } from "@/features/search/components/search-results";
import { deletedCableCode } from "@/lib/route-params";
import { getSearchOptions, searchCables } from "@/server/cables/search";
import { getReelStatus } from "@/server/meters/service";
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
  const canAct = CABLE_FIELD_ACTIONS.some((action) => canRunCableAction(user, action));
  const [result, options, reelStatus] = await Promise.all([
    searchCables(search),
    getSearchOptions(),
    search.reel ? getReelStatus(search.reel) : null,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Cables</h1>
        {hasPermission(user, "cable:create") ? (
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

      {search.reel ? (
        <ReelNotice
          reel={search.reel}
          status={reelStatus}
          clearHref={`/cables${cableSearchQuery(search, { reel: undefined, page: undefined })}`}
        />
      ) : null}

      <PendingListProvider>
        <SearchFilters search={search} options={options} />
        <SelectionProvider
          title="Cables"
          items={result.items.map((cable) => ({ key: cable.id, label: cable.code }))}
          total={result.total}
          selectAll={selectAllCablesAction.bind(null, search)}
          resetKey={cableSearchQuery(search, { page: undefined, size: undefined })}
          actions={<SaveChosenButton kind="CABLE" />}
        >
          <PendingResults>
            <SearchResults
              search={search}
              result={result}
              actions={canAct ? { permissions: user.permissions } : undefined}
            />
          </PendingResults>
        </SelectionProvider>
      </PendingListProvider>
    </div>
  );
}
