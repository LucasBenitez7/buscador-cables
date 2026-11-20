import type { Metadata } from "next";
import { hasPermission, parseActivitySearch } from "@cables/shared";
import { ActivityFilters } from "@/features/activity/components/activity-filters";
import { PendingListProvider, PendingResults } from "@/components/pending-list";
import { ActivityList } from "@/features/activity/components/activity-list";
import { activityPeople } from "@/features/activity/people";
import { listActivity, listActivityUsers } from "@/server/activity/service";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Actividad" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * «Actividad», one page for everybody (fase 17). Who may see everyone's field actions
 * (supervisors, admins) chooses the person with «Quién», «Yo» first; everybody else sees only
 * their own, and the person is never taken from the URL.
 */
export default async function ActivityPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const seesEveryone = hasPermission(user, "activity:view");
  const parsed = parseActivitySearch(await searchParams);
  const { actor: _ignored, ...own } = parsed;
  const search: typeof parsed = seesEveryone ? parsed : own;
  const [activity, users] = await Promise.all([
    listActivity(seesEveryone ? search : { ...search, actor: user.id }),
    seesEveryone ? listActivityUsers() : null,
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Actividad</h1>
        <p className="text-muted-foreground text-sm">
          {seesEveryone
            ? "Todo lo que se ha hecho con los cables, de lo más reciente a lo más antiguo."
            : "Lo que has registrado tú en los cables."}
        </p>
      </div>
      <PendingListProvider>
        <ActivityFilters
          basePath="/activity"
          search={search}
          users={users ? activityPeople(users, user) : undefined}
        />
        <PendingResults>
          <ActivityList
            basePath="/activity"
            search={search}
            activity={activity}
            showUser={seesEveryone && search.actor !== user.id}
          />
        </PendingResults>
      </PendingListProvider>
    </div>
  );
}
