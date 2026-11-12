import type { Metadata } from "next";
import { parseActivitySearch } from "@cables/shared";
import { ActivityFilters } from "@/features/activity/components/activity-filters";
import { ActivityList } from "@/features/activity/components/activity-list";
import { listActivity } from "@/server/activity/service";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Mi actividad" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The current user's own field actions. The person is never taken from the URL. */
export default async function MyActivityPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const { actor: _ignored, ...search } = parseActivitySearch(await searchParams);
  const activity = await listActivity({ ...search, actor: user.id });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Mi actividad</h1>
        <p className="text-muted-foreground text-sm">Lo que has registrado tú en los cables.</p>
      </div>
      <ActivityFilters basePath="/activity/me" search={search} />
      <ActivityList basePath="/activity/me" search={search} activity={activity} showUser={false} />
    </div>
  );
}
