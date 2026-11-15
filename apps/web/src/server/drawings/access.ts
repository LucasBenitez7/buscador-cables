import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Short signed pass to the drawing tiles (revisión F7.5, M2). Opening a sheet asks for dozens
 * of tiles: checking the session in the database for each one is slow once deployed and
 * competes for connections. The descriptor of a sheet (`<key>.dzi`) always checks the session
 * and hands out this cookie; the tiles of the next minutes only check its signature.
 *
 * It only opens `/api/drawings` and is deleted on sign-out. At worst, a browser keeps it a
 * few minutes after its session ends, and only for tiles: no new sheet opens without one.
 */
export const DRAWING_ACCESS_COOKIE = "drawing_access";
export const DRAWING_ACCESS_PATH = "/api/drawings";
export const DRAWING_ACCESS_SECONDS = 10 * 60;

const ACCESS = /^(\d{10})\.([A-Za-z0-9_-]{43})$/;

const signature = (expires: string) =>
  createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`drawing-access:${expires}`)
    .digest("base64url");

export function createDrawingAccess(now = Date.now()): string {
  const expires = String(Math.floor(now / 1000) + DRAWING_ACCESS_SECONDS);
  return `${expires}.${signature(expires)}`;
}

export function hasDrawingAccess(value: string | undefined, now = Date.now()): boolean {
  const match = value ? ACCESS.exec(value) : null;
  if (!match) return false;
  const [, expires, given] = match;
  if (Number(expires) * 1000 <= now) return false;
  return timingSafeEqual(Buffer.from(given!), Buffer.from(signature(expires!)));
}

export const drawingAccessCookie = (value: string, maxAge = DRAWING_ACCESS_SECONDS) => ({
  name: DRAWING_ACCESS_COOKIE,
  value,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: DRAWING_ACCESS_PATH,
  maxAge,
});
