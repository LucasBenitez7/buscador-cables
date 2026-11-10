import { prisma } from "@cables/db";
import { afterAll, beforeAll, vi } from "vitest";

// `server-only` throws when imported outside the Next.js server runtime.
vi.mock("server-only", () => ({}));

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
