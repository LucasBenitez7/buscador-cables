import "server-only";
import { parseEnvironment } from "@cables/shared";

export type Env = ReturnType<typeof parseEnvironment> & {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
};

function loadEnv(): Env {
  const parsed = parseEnvironment(process.env);

  if (!parsed.DATABASE_URL) {
    throw new Error("DATABASE_URL no está definida. Copia .env.example a .env y revísala.");
  }

  if (!parsed.BETTER_AUTH_SECRET) {
    throw new Error(
      "BETTER_AUTH_SECRET no está definida o tiene menos de 32 caracteres. Genera una (ver .env.example).",
    );
  }

  return parsed as Env;
}

/**
 * Validated server-side environment.
 *
 * Values are read from `process.env`, already populated from the monorepo root
 * `.env` by `scripts/next.mjs` (and by the test runners). Client-exposed values
 * must use the `NEXT_PUBLIC_` prefix.
 */
export const env: Env = loadEnv();
