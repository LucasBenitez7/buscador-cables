import type { Metadata } from "next";
import Link from "next/link";
import { hasPermission, parseCableSearch } from "@cables/shared";
import { Button } from "@/components/ui/button";
import { SearchFilters } from "@/features/search/components/search-filters";
import { SearchResults } from "@/features/search/components/search-results";
import { getSearchOptions, searchCables } from "@/server/cables/search";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Cables" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function CablesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const params = await searchParams;
  const search = parseCableSearch(params);
  const deleted = typeof params.deleted === "string" ? params.deleted : undefined;
  const [result, options] = await Promise.all([searchCables(search), getSearchOptions()]);

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
      <SearchResults search={search} result={result} />
    </div>
  );
}
