/**
 * When a session ends (decided with the user on 2026-11-20): every Sunday at 00:00 in Madrid,
 * the same moment for everybody, so the crew signs in once a week (on Sunday at home or on
 * Monday at work) instead of every day. A session started less than `MIN_SESSION_HOURS` before
 * that Sunday runs until the next one: whoever signs in on Saturday night is not sent back to
 * the login an hour later.
 */
export const SESSION_TIME_ZONE = "Europe/Madrid";
export const MIN_SESSION_HOURS = 12;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Date and weekday (0 = Sunday) of an instant in Madrid. */
function madridDay(at: Date): { year: number; month: number; day: number; weekday: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: SESSION_TIME_ZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: weekdays.indexOf(parts.weekday!),
  };
}

/** The instant of 00:00 in Madrid of a calendar day, whatever the summer time. */
function madridMidnight(year: number, month: number, day: number): Date {
  const guess = Date.UTC(year, month - 1, day);
  // La diferencia con UTC de ese día (+1 en invierno, +2 en verano), leída en la propia zona.
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: SESSION_TIME_ZONE,
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(guess))
    .find((part) => part.type === "timeZoneName")!
    .value.match(/GMT([+-])(\d{2}):(\d{2})/);
  const minutes = offset
    ? (offset[1] === "-" ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3]))
    : 0;
  return new Date(guess - minutes * 60 * 1000);
}

/** The Sunday 00:00 (Madrid) a session started at `now` ends at. */
export function sessionExpiry(now: Date): Date {
  const today = madridDay(now);
  // El próximo domingo; si hoy es domingo, el de la semana que viene.
  const daysToSunday = today.weekday === 0 ? 7 : 7 - today.weekday;
  const sunday = new Date(Date.UTC(today.year, today.month - 1, today.day) + daysToSunday * DAY);
  let end = madridMidnight(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate());
  if (end.getTime() - now.getTime() < MIN_SESSION_HOURS * HOUR) {
    const next = new Date(sunday.getTime() + 7 * DAY);
    end = madridMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  }
  return end;
}

/**
 * Longest a session can last (Saturday noon to the Sunday after next): the cookie's lifetime.
 * One hour more for the week summer time ends, which has 25 hours on its Sunday: without it,
 * the cookie went an hour before the session.
 */
export const SESSION_COOKIE_MAX_AGE_SECONDS = (7 * 24 + MIN_SESSION_HOURS + 1) * 60 * 60;
