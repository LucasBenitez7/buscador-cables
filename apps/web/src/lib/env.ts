import "server-only";
import { parseEnvironment } from "@cables/shared";

export type Env = ReturnType<typeof parseEnvironment> & { DATABASE_URL: string };

function loadEnv(): Env {
  const parsed = parseEnvironment(process.env);

  if (!parsed.DATABASE_URL) {
    throw new Error("DATABASE_URL no está definida. Copia .env.example a .env y revísala.");
  }

  return parsed as Env;
}

/**
 * Validated server-side environment.
 *
 * Values are read from `process.env`, already populated by `@next/env` in
 * `next.config.ts` (and by the test runners) from the monorepo root `.env`.
 * Client-exposed values must use the `NEXT_PUBLIC_` prefix.
 */
export const env: Env = loadEnv();
