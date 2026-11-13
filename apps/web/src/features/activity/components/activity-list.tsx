import Link from "next/link";
import { CABLE_ACTION_LABELS, activityQuery, type ActivitySearch } from "@cables/shared";
import { Pagination } from "@/components/pagination";
import { CODE_LINK } from "@/components/ui/text-link";
import type { ActivityPage } from "@/server/activity/service";

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

type Props = {
  basePath: string;
  search: ActivitySearch;
  activity: ActivityPage;
  /** "Mi actividad" hides the name: it is always the current user. */
  showUser?: boolean;
};

/** Field actions as a timeline: when, who, what, on which cable, with note and changes. */
export function ActivityList({ basePath, search, activity, showUser = true }: Props) {
  if (activity.total === 0) {
    return (
      <p role="status" className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
        No hay movimientos que cumplan estos filtros.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p role="status" className="text-muted-foreground text-sm">
        <span className="text-foreground font-medium">
          {activity.total.toLocaleString("es-ES")}
        </span>{" "}
        {activity.total === 1 ? "movimiento" : "movimientos"}
        {activity.pageCount > 1 ? ` · página ${activity.page} de ${activity.pageCount}` : ""}
      </p>
      <ol className="bg-card divide-y rounded-lg border">
        {activity.entries.map((entry) => (
          <li key={entry.id} className="space-y-1 px-4 py-3 text-sm">
            <p className="text-muted-foreground text-xs">
              <time dateTime={entry.at.toISOString()}>{dateFormat.format(entry.at)}</time> ·{" "}
              <span className="text-foreground font-medium">
                {CABLE_ACTION_LABELS[entry.action]}
              </span>{" "}
              ·{" "}
              <Link href={`/cables/${entry.cable.id}`} className={CODE_LINK}>
                {entry.cable.code}
              </Link>
              {entry.cable.deleted ? " (dado de baja)" : ""}
            </p>
            <p>
              {showUser ? <span className="font-medium">{entry.user} </span> : null}
              {showUser ? entry.summary : capitalize(entry.summary)}.
            </p>
            {entry.notes ? <p className="italic">“{entry.notes}”</p> : null}
            {entry.changes.length > 0 ? (
              <ul className="text-muted-foreground space-y-0.5">
                {entry.changes.map((change) => (
                  <li key={change.field}>
                    {change.field}: {change.from} →{" "}
                    <span className="text-foreground">{change.to}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>

      <Pagination
        page={activity.page}
        pageCount={activity.pageCount}
        href={(page) => `${basePath}${activityQuery(search, { page })}`}
        previousLabel="← Más recientes"
        nextLabel="Más antiguos →"
      />
    </div>
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
