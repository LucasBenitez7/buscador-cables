import { afterAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../src/client";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL_TEST debe estar definida para los tests de integración.");
}

const prisma = createPrismaClient(url);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("database connection", () => {
  it("connects to the test database", async () => {
    const [row] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    expect(row?.db).toBe("cables_test");
  });

  it("has the pg_trgm extension available", async () => {
    const rows = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`;
    expect(rows).toHaveLength(1);
  });
});
