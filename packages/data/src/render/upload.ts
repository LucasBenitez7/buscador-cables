/**
 * Uploads the tiles drawn by `pnpm data:render` to the private bucket of production (Cloudflare
 * R2, S3 API). Like the rendering, it only sends what changed: it compares the local manifest
 * with the one in the bucket by fingerprint. The manifest goes up after the tiles, so the app
 * never offers a sheet whose tiles are not there yet; the sheets that are gone are removed
 * after it.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import {
  DRAWINGS_MANIFEST,
  bucketObjectUrl,
  isCableSheetKey,
  type DrawingsBucket,
  type DrawingsManifest,
} from "@cables/shared";

export type UploadSummary = { uploaded: number; unchanged: number; removed: number; files: number };

const CONCURRENCY = 16;

const contentType = (file: string) =>
  file.endsWith(".dzi")
    ? "application/xml"
    : file.endsWith(".webp")
      ? "image/webp"
      : "application/json";

/** Runs `task` over `items`, a few at a time. */
async function inPool<T>(items: readonly T[], task: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await task(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
}

/**
 * Every file of a sheet: its descriptor and its tiles, relative to the folder, with "/". The
 * page of a cable is a single image.
 */
async function sheetFiles(dir: string, key: string): Promise<string[]> {
  if (isCableSheetKey(key)) return [`${key}.webp`];
  const tiles = await readdir(path.join(dir, `${key}_files`), {
    recursive: true,
    withFileTypes: true,
  });
  return [
    `${key}.dzi`,
    ...tiles
      .filter((entry) => entry.isFile())
      .map((entry) =>
        path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"),
      ),
  ];
}

export async function uploadDrawings(options: {
  dir: string;
  bucket: DrawingsBucket;
  /** Upload every sheet again, even the unchanged ones. */
  force?: boolean;
  onProgress?: (message: string) => void;
}): Promise<UploadSummary> {
  const { dir, bucket, force = false, onProgress = () => {} } = options;
  const client = new AwsClient({
    accessKeyId: bucket.accessKeyId,
    secretAccessKey: bucket.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const call = async (method: string, key: string, body?: Uint8Array, type?: string) => {
    const response = await client.fetch(bucketObjectUrl(bucket, key), {
      method,
      body,
      headers: type ? { "Content-Type": type } : undefined,
    });
    if (!response.ok && !(method === "GET" && response.status === 404)) {
      throw new Error(`El almacenamiento respondió ${response.status} a ${method} ${key}.`);
    }
    return response;
  };

  let local: DrawingsManifest;
  try {
    local = JSON.parse(
      await readFile(path.join(dir, DRAWINGS_MANIFEST), "utf8"),
    ) as DrawingsManifest;
  } catch {
    throw new Error(`No hay ${DRAWINGS_MANIFEST} en ${dir}. Ejecuta antes pnpm data:render.`);
  }
  const current = await call("GET", DRAWINGS_MANIFEST);
  const remote = (current.status === 404 ? {} : await current.json()) as DrawingsManifest;

  const summary: UploadSummary = { uploaded: 0, unchanged: 0, removed: 0, files: 0 };
  const changed = Object.keys(local).filter(
    (key) => force || remote[key]?.fingerprint !== local[key]!.fingerprint,
  );
  summary.unchanged = Object.keys(local).length - changed.length;
  for (const key of changed) {
    const files = await sheetFiles(dir, key);
    await inPool(files, async (file) => {
      await call("PUT", file, await readFile(path.join(dir, file)), contentType(file));
    });
    summary.uploaded += 1;
    summary.files += files.length;
    onProgress(`${key}: ${files.length} ficheros`);
  }

  const manifest = new TextEncoder().encode(`${JSON.stringify(local, null, 1)}\n`);
  await call("PUT", DRAWINGS_MANIFEST, manifest, "application/json");

  for (const key of Object.keys(remote).filter((key) => !(key in local))) {
    const files = isCableSheetKey(key)
      ? [`${key}.webp`]
      : [`${key}.dzi`, ...(await listKeys(bucket, client, `${key}_files/`))];
    await inPool(files, async (file) => {
      await call("DELETE", file);
    });
    summary.removed += 1;
    onProgress(`${key}: retirada`);
  }
  return summary;
}

/** Keys of the bucket under a prefix (ListObjectsV2, page by page). */
async function listKeys(bucket: DrawingsBucket, client: AwsClient, prefix: string) {
  const keys: string[] = [];
  let token: string | null = null;
  do {
    const url = new URL(`${bucket.endpoint}/${encodeURIComponent(bucket.bucket)}`);
    url.searchParams.set("list-type", "2");
    url.searchParams.set("prefix", prefix);
    if (token) url.searchParams.set("continuation-token", token);
    const response = await client.fetch(url.toString());
    if (!response.ok) throw new Error(`El almacenamiento respondió ${response.status} al listar.`);
    const xml = await response.text();
    keys.push(...[...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) => match[1]!));
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? (/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1] ?? null)
      : null;
  } while (token);
  return keys;
}
