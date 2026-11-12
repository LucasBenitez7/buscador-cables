import type { Metadata } from "next";
import { parseActivitySearch } from "@cables/shared";
import { ActivityFilters } from "@/features/activity/components/activity-filters";
import { ActivityList } from "@/features/activity/components/activity-list";
import { listActivity, listActivityUsers } from "@/server/activity/service";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Actividad reciente" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Everybody's field actions, for supervisors and admins. */
export default async function ActivityPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission("activity:view");
  const search = parseActivitySearch(await searchParams);
  const [activity, users] = await Promise.all([listActivity(search), listActivityUsers()]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Actividad reciente</h1>
        <p className="text-muted-foreground text-sm">
          Todo lo que se ha hecho con los cables, de lo más reciente a lo más antiguo.
        </p>
      </div>
      <ActivityFilters basePath="/activity" search={search} users={users} />
      <ActivityList basePath="/activity" search={search} activity={activity} />
    </div>
  );
}
