import Link from "next/link";
import type { ReactNode } from "react";
import {
  ACTIVITY_PAGE_SIZES,
  CABLE_ACTION_LABELS,
  activityQuery,
  type ActivitySearch,
  type CableAction,
} from "@cables/shared";
import { ChangeList } from "@/components/change-list";
import { PageSizePicker } from "@/components/page-size-picker";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { CODE_LINK } from "@/components/ui/text-link";
import type { ActivityEntry, ActivityPage } from "@/server/activity/service";

const TIME_ZONE = "Europe/Madrid";
const timeFormat = new Intl.DateTimeFormat("es-ES", { timeStyle: "short", timeZone: TIME_ZONE });
const dayFormat = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TIME_ZONE,
});
/** "2026-11-14", the day in Madrid (what the date filters use). */
const dayKey = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);

type BadgeVariant = "default" | "outline" | "info" | "success" | "warning" | "destructive";

/** The colour of an action, the same family as the cable states it leads to. */
export function actionVariant(entry: Pick<ActivityEntry, "action" | "changes">): BadgeVariant {
  const variants: Record<CableAction, BadgeVariant> = {
    CREATED: "outline",
    UPDATED: "outline",
    LAID: "info",
    PARTIALLY_LAID: "warning",
    COILED: "default",
    CONNECTED: "success",
    DISCONNECTED: "outline",
    MOVED: "default",
    RETIRED: "destructive",
    CORRECTION: "warning",
    TESTED: "success",
    DELETED: "destructive",
  };
  if (entry.action === "TESTED" && entry.changes.some((change) => /fallo/.test(change.to))) {
    return "destructive";
  }
  return variants[entry.action];
}

type Props = {
  basePath: string;
  search: ActivitySearch;
  activity: ActivityPage;
  /** "Mi actividad" hides the name: it is always the current user. */
  showUser?: boolean;
  /** Today in Madrid ("2026-11-14"), for the day headings and the quick ranges. */
  today?: string;
};

/**
 * Field actions grouped by day, newest first: when, what (coloured like the state it leads
 * to), on which cable, who, the note and what changed. Cables, trays, places and people are
 * links: from here one click opens what the movement is about.
 */
export function ActivityList({
  basePath,
  search,
  activity,
  showUser = true,
  today = dayKey(new Date()),
}: Props) {
  const ranges = <QuickRanges basePath={basePath} search={search} today={today} />;

  if (activity.total === 0) {
    return (
      <div className="space-y-3">
        {ranges}
        <p
          role="status"
          className="text-muted-foreground rounded-lg border p-6 text-center text-sm"
        >
          No hay movimientos que cumplan estos filtros.
        </p>
      </div>
    );
  }

  const days: { key: string; entries: ActivityEntry[] }[] = [];
  for (const entry of activity.entries) {
    const key = dayKey(entry.at);
    const last = days.at(-1);
    if (last?.key === key) last.entries.push(entry);
    else days.push({ key, entries: [entry] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-muted-foreground text-sm">
          <span className="text-foreground font-medium">
            {activity.total.toLocaleString("es-ES")}
          </span>{" "}
          {activity.total === 1 ? "movimiento" : "movimientos"}
          {activity.pageCount > 1 ? ` · página ${activity.page} de ${activity.pageCount}` : ""}
        </p>
        {activity.total > ACTIVITY_PAGE_SIZES[0] ? (
          <PageSizePicker
            sizes={ACTIVITY_PAGE_SIZES}
            size={search.size}
            page={activity.page}
            href={(size, page) => `${basePath}${activityQuery(search, { size, page })}`}
          />
        ) : null}
      </div>
      {ranges}

      {days.map((day) => (
        <section key={day.key} aria-labelledby={`day-${day.key}`} className="space-y-2">
          <h2
            id={`day-${day.key}`}
            className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
          >
            {dayHeading(day.key, day.entries[0]!.at, today)}
          </h2>
          <ol className="bg-card divide-y rounded-lg border">
            {day.entries.map((entry) => (
              <Entry key={entry.id} entry={entry} basePath={basePath} showUser={showUser} />
            ))}
          </ol>
        </section>
      ))}

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

function Entry({
  entry,
  basePath,
  showUser,
}: {
  entry: ActivityEntry;
  basePath: string;
  showUser: boolean;
}) {
  return (
    <li className="flex gap-3 px-4 py-3 text-sm">
      <time
        dateTime={entry.at.toISOString()}
        className="text-muted-foreground w-11 shrink-0 pt-0.5 text-xs tabular-nums"
      >
        {timeFormat.format(entry.at)}
      </time>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge dot variant={actionVariant(entry)}>
            {CABLE_ACTION_LABELS[entry.action]}
          </Badge>
          <Link href={`/cables/${entry.cable.id}`} className={`${CODE_LINK} text-base`}>
            {entry.cable.code}
          </Link>
          {entry.cable.deleted ? (
            <span className="text-muted-foreground text-xs">(dado de baja)</span>
          ) : null}
        </div>
        <p>
          {showUser ? (
            <>
              <Link
                href={`${basePath}${activityQuery({ actor: entry.userId })}`}
                title={`Ver solo los movimientos de ${entry.user}`}
                className="hover:text-primary focus-visible:ring-ring/50 rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3"
              >
                {entry.user}
              </Link>{" "}
            </>
          ) : null}
          <Sentence entry={entry} capitalized={!showUser} />.
        </p>
        {entry.notes ? (
          <blockquote className="border-muted-foreground/40 text-muted-foreground border-l-2 pl-3 italic">
            “{entry.notes}”
          </blockquote>
        ) : null}
        <ChangeList changes={entry.changes} />
      </div>
    </li>
  );
}

/**
 * The sentence of the event with its tray and places as links ("movió el cable de [A] a [B]").
 * Only exact mentions are linked: the text itself comes from `describeCableEvent`.
 */
function Sentence({ entry, capitalized }: { entry: ActivityEntry; capitalized: boolean }) {
  const text = capitalized
    ? entry.summary.charAt(0).toUpperCase() + entry.summary.slice(1)
    : entry.summary;
  const links: { text: string; href: string }[] = [];
  if (entry.tray)
    links.push({ text: entry.tray, href: `/trays/${encodeURIComponent(entry.tray)}` });
  for (const place of [entry.from, entry.to]) {
    if (place)
      links.push({ text: place.name, href: `/cables?location=${encodeURIComponent(place.id)}` });
  }

  let parts: ReactNode[] = [text];
  for (const link of links) {
    parts = parts.flatMap((part, index) => {
      if (typeof part !== "string" || !part.includes(link.text)) return [part];
      const [before, ...rest] = part.split(link.text);
      return [
        before,
        <Link
          key={`${link.href}-${index}`}
          href={link.href}
          className="hover:text-primary focus-visible:ring-ring/50 rounded-sm font-medium underline underline-offset-2 outline-none focus-visible:ring-3"
        >
          {link.text}
        </Link>,
        rest.join(link.text),
      ];
    });
  }
  return <>{parts}</>;
}

function dayHeading(key: string, date: Date, today: string): string {
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const label = dayFormat.format(date);
  if (key === today) return `Hoy · ${label}`;
  if (key === yesterday.toISOString().slice(0, 10)) return `Ayer · ${label}`;
  return label;
}

/** "Todo · Hoy · Últimos 7 días": the ranges people ask for most, as links. */
function QuickRanges({
  basePath,
  search,
  today,
}: {
  basePath: string;
  search: ActivitySearch;
  today: string;
}) {
  const weekAgo = new Date(`${today}T12:00:00Z`);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 6);
  const week = weekAgo.toISOString().slice(0, 10);
  const ranges = [
    { label: "Todo", from: undefined, to: undefined },
    { label: "Hoy", from: today, to: undefined },
    { label: "Últimos 7 días", from: week, to: undefined },
  ];
  return (
    <nav aria-label="Periodo" className="flex flex-wrap gap-1.5">
      {ranges.map((range) => {
        const active = search.from === range.from && search.to === range.to;
        return (
          <Link
            key={range.label}
            href={`${basePath}${activityQuery(search, { from: range.from, to: range.to, page: undefined })}`}
            aria-current={active ? "true" : undefined}
            className={
              active
                ? "bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs font-medium"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring/50 rounded-full border px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-3"
            }
          >
            {range.label}
          </Link>
        );
      })}
    </nav>
  );
}
