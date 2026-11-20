import { redirect } from "next/navigation";
import { activityQuery, hasPermission, parseActivitySearch } from "@cables/shared";
import { requireUser } from "@/server/session";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * «Mi actividad» is now «Actividad» (fase 17). Old links land on the person's own activity with
 * the filters they carried: filtered by «Yo» for who sees everyone's, and as they are for
 * everybody else (who only ever sees their own).
 */
export default async function MyActivityPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const search = parseActivitySearch(await searchParams);
  const actor = hasPermission(user, "activity:view") ? user.id : undefined;
  redirect(`/activity${activityQuery(search, { actor })}`);
}
