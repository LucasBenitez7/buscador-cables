import { prisma } from "@cables/db";
import { afterAll, beforeAll, vi } from "vitest";

// `server-only` throws when imported outside the Next.js server runtime.
vi.mock("server-only", () => ({}));

// Sin corte en los tests de integración: las fechas fijas de los tests (2026-06, 2026-11-10…)
// quedan por delante de la fecha real del historial. Los tests del corte lo ponen a mano.
process.env.HISTORY_START = "1970-01-01T00:00:00Z";

beforeAll(async () => {
  // Salvaguarda: estos tests borran datos. Nunca deben tocar la base de desarrollo.
  const [row] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  if (row?.db !== "cables_test") {
    throw new Error(`Los tests de integración deben usar cables_test, no ${row?.db ?? "?"}.`);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});
