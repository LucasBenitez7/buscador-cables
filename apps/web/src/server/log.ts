/**
 * Server logs as one JSON line each: Vercel (and any host) shows them in its log panel and
 * lets them be filtered by `level` or `scope`. Never with personal data or secrets: a scope, a
 * message and, for errors, its message and stack.
 */

type Fields = Record<string, string | number | boolean | null | undefined>;

function line(level: "info" | "warn" | "error", scope: string, message: string, fields: Fields) {
  return JSON.stringify({ level, time: new Date().toISOString(), scope, message, ...fields });
}

const describeError = (error: unknown): Fields =>
  error instanceof Error
    ? { error: error.message, stack: error.stack?.split("\n").slice(0, 6).join("\n") }
    : { error: String(error) };

export function logInfo(scope: string, message: string, fields: Fields = {}) {
  // Log estructurado, también en el runtime Edge (sin `process.stdout`).
  // eslint-disable-next-line no-console -- el nivel va dentro del JSON
  console.log(line("info", scope, message, fields));
}

export function logError(scope: string, message: string, error?: unknown, fields: Fields = {}) {
  console.error(
    line("error", scope, message, {
      ...(error === undefined ? {} : describeError(error)),
      ...fields,
    }),
  );
}
