import "server-only";
import { prisma } from "@cables/db";

/** Rate-limit counters untouched for longer than this are of no use (the longest lock is 15 min). */
export const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;

export type CleanupSummary = { verifications: number; sessions: number; rateLimits: number };

/**
 * Removes what only grows: expired verification tokens (email, password reset), expired
 * sessions and old rate-limit counters. Run every day by Vercel Cron (`/api/cron/cleanup`).
 */
export async function cleanupExpired(now = new Date()): Promise<CleanupSummary> {
  const [verifications, sessions, rateLimits] = await prisma.$transaction([
    prisma.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.rateLimit.deleteMany({
      where: { lastRequest: { lt: BigInt(now.getTime() - RATE_LIMIT_RETENTION_MS) } },
    }),
  ]);
  return {
    verifications: verifications.count,
    sessions: sessions.count,
    rateLimits: rateLimits.count,
  };
}
