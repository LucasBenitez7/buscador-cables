import "server-only";
import { prisma, type Prisma } from "@cables/db";
import {
  ACTIVITY_PAGE_SIZE,
  describeCableEvent,
  type ActivitySearch,
  type CableAction,
} from "@cables/shared";
import {
  loadLookups,
  locationName,
  readableChanges,
  userName,
  type ReadableChange,
} from "@/server/cables/detail";

export type ActivityEntry = {
  id: string;
  at: Date;
  action: CableAction;
  user: string;
  cable: { id: string; code: string; deleted: boolean };
  /** Predicate after the user's name: "movió el cable de A a B". */
  summary: string;
  notes: string | null;
  changes: ReadableChange[];
};

export type ActivityPage = {
  entries: ActivityEntry[];
  total: number;
  page: number;
  pageCount: number;
};

/** First instant of a day in Madrid, as a UTC Date (handles summer time). */
function madridDayStart(day: string): Date {
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  const madridHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Madrid",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(utcMidnight),
  );
  // Madrid is UTC+1 or UTC+2: at 00:00 UTC it is 01:00 or 02:00 there.
  return new Date(utcMidnight.getTime() - madridHour * 60 * 60 * 1000);
}

function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Field actions newest first, optionally limited to one user (Mi actividad), one action and a
 * date range in Madrid days. Everybody can read the history (phase 5 visibility rule); the
 * page decides who may look at other people's activity.
 */
export async function listActivity(
  search: ActivitySearch,
  pageSize = ACTIVITY_PAGE_SIZE,
): Promise<ActivityPage> {
  const where: Prisma.CableEventWhereInput = {
    ...(search.actor ? { userId: search.actor } : {}),
    ...(search.action ? { action: search.action } : {}),
    ...(search.from || search.to
      ? {
          createdAt: {
            ...(search.from ? { gte: madridDayStart(search.from) } : {}),
            ...(search.to ? { lt: madridDayStart(nextDay(search.to)) } : {}),
          },
        }
      : {}),
  };

  const total = await prisma.cableEvent.count({ where });
  const pageCount = Math.ceil(total / pageSize);
  const page = Math.min(search.page ?? 1, Math.max(pageCount, 1));
  if (total === 0) {
    return { entries: [], total: 0, page: 1, pageCount: 0 };
  }

  const [events, lookups] = await Promise.all([
    prisma.cableEvent.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { name: true, role: true } },
        cable: { select: { id: true, code: true, deletedAt: true } },
      },
    }),
    loadLookups(),
  ]);

  return {
    entries: events.map((event) => ({
      id: event.id,
      at: event.createdAt,
      action: event.action,
      user: userName(event.user),
      cable: {
        id: event.cable.id,
        code: event.cable.code,
        deleted: event.cable.deletedAt !== null,
      },
      summary: describeCableEvent({
        action: event.action,
        changes: event.changes,
        fromLocation: locationName(lookups, event.fromLocationId),
        toLocation: locationName(lookups, event.toLocationId),
      }),
      notes: event.notes,
      changes: readableChanges(event.changes, lookups),
    })),
    total,
    page,
    pageCount,
  };
}

/** People who appear in the activity filter, sorted by name. */
export async function listActivityUsers(): Promise<{ id: string; label: string }[]> {
  // Only who has registered something: the filter is not a list of every account.
  const users = await prisma.user.findMany({
    where: { cableEvents: { some: {} } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return users.map((user) => ({ id: user.id, label: user.name }));
}
