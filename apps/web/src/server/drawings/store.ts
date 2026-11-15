import "server-only";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseEnvironment } from "@cables/shared";

/**
 * The drawing tiles drawn by `pnpm data:render` (`<key>.dzi` and `<key>_files/<level>/<x>_<y>.webp`).
 * They are the client's drawings: they live outside git and the app hands them out only to
 * signed-in users (see `app/api/drawings`). Today on the local disk; in production this module
 * is the one piece to change for private object storage (phase 10).
 */

const KEY = /^[A-Za-z0-9_-]{1,120}$/;
const LEVEL = /^\d{1,2}$/;
const TILE = /^\d{1,4}_\d{1,4}\.webp$/;

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

export function drawingsDir(): string {
  const configured = parseEnvironment(process.env).DRAWINGS_DIR;
  return path.isAbsolute(configured) ? configured : path.join(repoRoot(), configured);
}

export type DrawingFile = { body: Buffer; contentType: string };

/**
 * The relative path of a tile or descriptor from the URL segments, or null for anything else.
 * Only two shapes are accepted, so a URL can never reach a file outside the tiles.
 */
export function drawingFilePath(segments: readonly string[]): string | null {
  if (segments.length === 1) {
    const [file] = segments;
    const key = file!.endsWith(".dzi") ? file!.slice(0, -4) : null;
    return key && KEY.test(key) ? `${key}.dzi` : null;
  }
  if (segments.length === 3) {
    const [folder, level, tile] = segments;
    const key = folder!.endsWith("_files") ? folder!.slice(0, -6) : null;
    if (key && KEY.test(key) && LEVEL.test(level!) && TILE.test(tile!)) {
      return path.join(`${key}_files`, level!, tile!);
    }
  }
  return null;
}

export async function readDrawingFile(segments: readonly string[]): Promise<DrawingFile | null> {
  const relative = drawingFilePath(segments);
  if (!relative) return null;
  try {
    const body = await readFile(path.join(drawingsDir(), relative));
    return {
      body,
      contentType: relative.endsWith(".dzi") ? "application/xml" : "image/webp",
    };
  } catch {
    return null;
  }
}

/** Whether `pnpm data:render` has drawn this sheet. */
export async function hasDrawingImage(key: string): Promise<boolean> {
  if (!KEY.test(key)) return false;
  try {
    return (await stat(path.join(drawingsDir(), `${key}.dzi`))).isFile();
  } catch {
    return false;
  }
}
