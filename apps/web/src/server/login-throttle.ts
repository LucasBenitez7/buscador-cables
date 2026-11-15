import "server-only";
import { prisma } from "@cables/db";
import { APIError } from "better-auth/api";
import { AUTH_ERROR_CODES } from "@/lib/auth-errors";

/**
 * Failed sign-ins per account, on top of Better Auth's per-IP limit.
 *
 * Everybody in a plant shares one public IP, so the per-IP limit has to be generous or a
 * shift change would lock the whole plant out. This one is per email instead: after
 * `MAX_FAILURES` wrong passwords in a row the account stops accepting sign-ins until
 * `LOCK_MS` have passed since the last failure, whatever IP the attempts come from.
 *
 * Counters live in the `rateLimit` table (shared by every serverless instance) under their
 * own key prefix, next to Better Auth's own `ip|path` counters. Unknown emails are counted
 * too, so the lock does not reveal which accounts exist.
 */
export const MAX_LOGIN_FAILURES = 10;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

const PREFIX = "login-failures:";
const MAX_EMAIL_LENGTH = 254;

/** The counter key of an email, or null when the value cannot be an email worth counting. */
function keyFor(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  if (normalized === "" || normalized.length > MAX_EMAIL_LENGTH) return null;
  return `${PREFIX}${normalized}`;
}

/** Throws a 429 with ACCOUNT_LOCKED while the account is locked. */
export async function assertLoginNotLocked(email: unknown, now = Date.now()): Promise<void> {
  const key = keyFor(email);
  if (!key) return;
  const row = await prisma.rateLimit.findUnique({ where: { key } });
  if (!row) return;
  if (row.count >= MAX_LOGIN_FAILURES && now - Number(row.lastRequest) < LOGIN_LOCK_MS) {
    throw APIError.from("TOO_MANY_REQUESTS", {
      code: AUTH_ERROR_CODES.ACCOUNT_LOCKED,
      message: "Demasiados intentos fallidos con este correo.",
    });
  }
}

/** Counts a wrong password. Failures older than the lock time no longer count. */
export async function recordLoginFailure(email: unknown, now = Date.now()): Promise<void> {
  const key = keyFor(email);
  if (!key) return;
  const stale = BigInt(now - LOGIN_LOCK_MS);
  await prisma.$transaction([
    // Counters nobody touched for a while: the account is unlocked again and the row is noise.
    prisma.rateLimit.deleteMany({
      where: { key: { startsWith: PREFIX }, lastRequest: { lt: stale } },
    }),
    prisma.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, lastRequest: BigInt(now) },
      update: { count: { increment: 1 }, lastRequest: BigInt(now) },
    }),
  ]);
}

/** A correct password clears the counter. */
export async function clearLoginFailures(email: unknown): Promise<void> {
  const key = keyFor(email);
  if (!key) return;
  await prisma.rateLimit.deleteMany({ where: { key } });
}
