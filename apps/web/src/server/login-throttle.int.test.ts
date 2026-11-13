import { prisma } from "@cables/db";
import { APIError } from "better-auth/api";
import { beforeEach, describe, expect, it } from "vitest";
import { AUTH_ERROR_CODES } from "@/lib/auth-errors";
import {
  LOGIN_LOCK_MS,
  MAX_LOGIN_FAILURES,
  assertLoginNotLocked,
  clearLoginFailures,
  recordLoginFailure,
} from "./login-throttle";

const EMAIL = "ana@planta.example";
const START = Date.UTC(2026, 10, 13, 8, 0, 0);

async function fail(times: number, email = EMAIL, from = START) {
  for (let index = 0; index < times; index += 1) {
    await recordLoginFailure(email, from + index * 1000);
  }
}

beforeEach(async () => {
  await prisma.rateLimit.deleteMany();
});

// Revisión F0-F7 (M7): el único límite era por IP, y toda la planta comparte una.
describe("login throttle per account", () => {
  it("lets the account sign in below the limit", async () => {
    await fail(MAX_LOGIN_FAILURES - 1);

    await expect(assertLoginNotLocked(EMAIL, START + 60_000)).resolves.toBeUndefined();
  });

  it("locks the account after too many wrong passwords in a row", async () => {
    await fail(MAX_LOGIN_FAILURES);

    const error = await assertLoginNotLocked(EMAIL, START + 60_000).catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(APIError);
    expect((error as APIError).status).toBe("TOO_MANY_REQUESTS");
    expect((error as APIError).body?.code).toBe(AUTH_ERROR_CODES.ACCOUNT_LOCKED);
  });

  it("counts the email whatever its case and spacing, and only that email", async () => {
    await fail(MAX_LOGIN_FAILURES, "  ANA@Planta.Example ");

    await expect(assertLoginNotLocked(EMAIL, START + 60_000)).rejects.toBeInstanceOf(APIError);
    await expect(
      assertLoginNotLocked("otro@planta.example", START + 60_000),
    ).resolves.toBeUndefined();
  });

  it("unlocks the account once the lock time has passed since the last failure", async () => {
    await fail(MAX_LOGIN_FAILURES);
    const lastFailure = START + (MAX_LOGIN_FAILURES - 1) * 1000;

    await expect(
      assertLoginNotLocked(EMAIL, lastFailure + LOGIN_LOCK_MS - 1),
    ).rejects.toBeInstanceOf(APIError);
    await expect(assertLoginNotLocked(EMAIL, lastFailure + LOGIN_LOCK_MS)).resolves.toBeUndefined();
  });

  it("starts counting again after the lock time, and drops stale counters", async () => {
    await fail(MAX_LOGIN_FAILURES);
    await fail(MAX_LOGIN_FAILURES, "otro@planta.example");

    await recordLoginFailure(EMAIL, START + LOGIN_LOCK_MS * 2);

    const rows = await prisma.rateLimit.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: `login-failures:${EMAIL}`, count: 1 });
  });

  it("clears the counter after a correct password", async () => {
    await fail(MAX_LOGIN_FAILURES);

    await clearLoginFailures(EMAIL);

    await expect(assertLoginNotLocked(EMAIL, START + 60_000)).resolves.toBeUndefined();
    expect(await prisma.rateLimit.count()).toBe(0);
  });

  it("leaves Better Auth's own per-IP counters alone", async () => {
    await prisma.rateLimit.create({
      data: { key: "203.0.113.7|/sign-in/email", count: 3, lastRequest: BigInt(START) },
    });

    await recordLoginFailure(EMAIL, START + LOGIN_LOCK_MS * 2);
    await clearLoginFailures(EMAIL);

    expect(await prisma.rateLimit.count()).toBe(1);
  });

  it("ignores values that are not an email", async () => {
    await expect(recordLoginFailure(undefined)).resolves.toBeUndefined();
    await expect(recordLoginFailure("x".repeat(300))).resolves.toBeUndefined();
    await expect(assertLoginNotLocked(42)).resolves.toBeUndefined();
    expect(await prisma.rateLimit.count()).toBe(0);
  });
});
