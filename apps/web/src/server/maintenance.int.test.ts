import { prisma } from "@cables/db";
import { beforeEach, describe, expect, it } from "vitest";
import { RATE_LIMIT_RETENTION_MS, cleanupExpired } from "./maintenance";

const NOW = new Date("2026-11-15T04:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "verification", "rateLimit", "user" CASCADE');
});

// Fase 10: `verification` y `rateLimit` solo crecían.
describe("cleanupExpired", () => {
  it("removes expired tokens, sessions and old counters, and keeps the rest", async () => {
    const user = await prisma.user.create({
      data: { id: "u1", name: "Ana", email: "ana@cables.test" },
    });
    await prisma.verification.createMany({
      data: [
        { identifier: "a", value: "x", expiresAt: ago(1000) },
        { identifier: "b", value: "y", expiresAt: new Date(NOW.getTime() + 60_000) },
      ],
    });
    await prisma.session.createMany({
      data: [
        { token: "old", userId: user.id, expiresAt: ago(1000) },
        { token: "live", userId: user.id, expiresAt: new Date(NOW.getTime() + 60_000) },
      ],
    });
    await prisma.rateLimit.createMany({
      data: [
        { key: "viejo", count: 3, lastRequest: BigInt(ago(RATE_LIMIT_RETENTION_MS + 1).getTime()) },
        { key: "reciente", count: 3, lastRequest: BigInt(ago(60_000).getTime()) },
      ],
    });

    expect(await cleanupExpired(NOW)).toEqual({ verifications: 1, sessions: 1, rateLimits: 1 });

    expect((await prisma.verification.findMany()).map((row) => row.identifier)).toEqual(["b"]);
    expect((await prisma.session.findMany()).map((row) => row.token)).toEqual(["live"]);
    expect((await prisma.rateLimit.findMany()).map((row) => row.key)).toEqual(["reciente"]);
  });
});
