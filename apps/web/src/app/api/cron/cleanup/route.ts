import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { logInfo } from "@/server/log";
import { cleanupExpired } from "@/server/maintenance";

/**
 * Daily cleanup (Vercel Cron, see `vercel.json`). Vercel calls it with
 * `Authorization: Bearer <CRON_SECRET>`; without the secret configured it never runs.
 */
export async function GET(request: Request) {
  if (!isCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const summary = await cleanupExpired();
  logInfo("cron", "Limpieza de tokens, sesiones y contadores caducados", summary);
  return NextResponse.json(summary);
}

function isCron(header: string | null): boolean {
  const secret = env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
