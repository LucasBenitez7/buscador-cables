import "server-only";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import {
  DRAWINGS_MANIFEST,
  bucketObjectUrl,
  drawingsBucket,
  environmentSchema,
  isCableSheetKey,
  type DrawingsBucket,
  type DrawingsManifest,
} from "@cables/shared";
import { logError } from "@/server/log";

/**
 * The drawing tiles drawn by `pnpm data:render` (`<key>.dzi` and `<key>_files/<level>/<x>_<y>.webp`).
 * They are the client's drawings: they live outside git and the app hands them out only to
 * signed-in users (see `app/api/drawings`). This module is the one piece that knows where:
 * - with `DRAWINGS_S3_*` (production), a private bucket of Cloudflare R2 that
 *   `pnpm data:upload` fills; the app reads it with its own keys;
 * - without them (local), the folder `DRAWINGS_DIR`.
 */

const KEY = /^[A-Za-z0-9_-]{1,120}$/;
const LEVEL = /^\d{1,2}$/;
const TILE = /^\d{1,4}_\d{1,4}\.webp$/;
/** How long an instance trusts the list of drawn sheets of the bucket. */
export const MANIFEST_TTL_MS = 60_000;

/** The monorepo root: the first folder up from here with `pnpm-workspace.yaml`. */
function repoRoot(): string {
  let dir = process.cwd();
  while (!existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
  return dir;
}

// Resolved once, not on every tile; again only if the variable changes (the tests change it).
let resolved: { raw: string | undefined; dir: string } | null = null;

export function drawingsDir(): string {
  const raw = process.env.DRAWINGS_DIR;
  if (resolved && resolved.raw === raw) return resolved.dir;
  const configured = environmentSchema.shape.DRAWINGS_DIR.parse(raw);
  const dir = path.isAbsolute(configured) ? configured : path.join(repoRoot(), configured);
  resolved = { raw, dir };
  return dir;
}

type Remote = { bucket: DrawingsBucket; client: AwsClient };
let remote: { signature: string; value: Remote | null } | null = null;
let manifest: { at: number; keys: Set<string> } | null = null;

/** The bucket of the tiles, or null for the local folder. */
function remoteStore(): Remote | null {
  const bucket = drawingsBucket(process.env);
  const signature = JSON.stringify(bucket);
  if (remote?.signature === signature) return remote.value;
  const value = bucket
    ? {
        bucket,
        client: new AwsClient({
          accessKeyId: bucket.accessKeyId,
          secretAccessKey: bucket.secretAccessKey,
          service: "s3",
          region: "auto",
        }),
      }
    : null;
  remote = { signature, value };
  manifest = null;
  return value;
}

/** An object of the bucket, or null if it is not there. Any other answer is an error. */
async function readRemote({ bucket, client }: Remote, key: string): Promise<Buffer | null> {
  const response = await client.fetch(bucketObjectUrl(bucket, key));
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`El almacenamiento de los planos respondió ${response.status} a ${key}.`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/** The sheets drawn in the bucket, from its manifest (one request a minute per instance). */
async function remoteSheets(store: Remote): Promise<Set<string>> {
  if (manifest && Date.now() - manifest.at < MANIFEST_TTL_MS) return manifest.keys;
  const body = await readRemote(store, DRAWINGS_MANIFEST);
  const keys = new Set(
    body ? Object.keys(JSON.parse(body.toString("utf8")) as DrawingsManifest) : [],
  );
  manifest = { at: Date.now(), keys };
  return keys;
}

export type DrawingFile = {
  body: Buffer;
  contentType: string;
  /** Strong validator of the content: the browser revalidates instead of keeping it. */
  etag: string;
};

/**
 * The descriptor of a sheet (`<key>.dzi`), the first thing the viewer asks for, or the single
 * image of a cable page (`<key>.webp`): both always check the session.
 */
export const isDrawingDescriptor = (segments: readonly string[]): boolean => segments.length === 1;

/**
 * The relative path of a tile or descriptor from the URL segments, or null for anything else.
 * Only three shapes are accepted, so a URL can never reach a file outside the drawings: a
 * descriptor, a tile, or the image of a cable page (fase 11). Always with "/": it is also the
 * key of the object in the bucket.
 */
export function drawingFilePath(segments: readonly string[]): string | null {
  if (segments.length === 1) {
    const [file] = segments;
    if (file!.endsWith(".dzi")) {
      const key = file!.slice(0, -4);
      return KEY.test(key) ? `${key}.dzi` : null;
    }
    if (file!.endsWith(".webp")) {
      const key = file!.slice(0, -5);
      return KEY.test(key) && isCableSheetKey(key) ? `${key}.webp` : null;
    }
    return null;
  }
  if (segments.length === 3) {
    const [folder, level, tile] = segments;
    const key = folder!.endsWith("_files") ? folder!.slice(0, -6) : null;
    if (key && KEY.test(key) && LEVEL.test(level!) && TILE.test(tile!)) {
      return `${key}_files/${level}/${tile}`;
    }
  }
  return null;
}

export async function readDrawingFile(segments: readonly string[]): Promise<DrawingFile | null> {
  const relative = drawingFilePath(segments);
  if (!relative) return null;
  const store = remoteStore();
  let body: Buffer | null;
  if (store) {
    body = await readRemote(store, relative);
  } else {
    try {
      body = await readFile(path.join(drawingsDir(), relative));
    } catch {
      body = null;
    }
  }
  if (!body) return null;
  return {
    body,
    contentType: relative.endsWith(".dzi") ? "application/xml" : "image/webp",
    etag: `"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`,
  };
}

/** Whether `pnpm data:render` has drawn this sheet (and, in production, it was uploaded). */
export async function hasDrawingImage(key: string): Promise<boolean> {
  if (!KEY.test(key)) return false;
  const store = remoteStore();
  if (store) {
    try {
      return (await remoteSheets(store)).has(key);
    } catch (error) {
      // Sin el almacenamiento, la ficha se ve igual, sin plano.
      logError("drawings", "No se pudo leer el manifiesto del almacenamiento", error);
      return false;
    }
  }
  try {
    const file = isCableSheetKey(key) ? `${key}.webp` : `${key}.dzi`;
    return (await stat(path.join(drawingsDir(), file))).isFile();
  } catch {
    return false;
  }
}
