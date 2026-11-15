/**
 * Where the drawing tiles live in production: a private bucket of an S3-compatible storage
 * (Cloudflare R2). `pnpm data:upload` puts them there and the app reads them through its own
 * route, so they are still only for signed-in users. Without a bucket, both use the local
 * folder `DRAWINGS_DIR`.
 */

export type DrawingsBucket = {
  /** "https://<account>.r2.cloudflarestorage.com" */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** What `pnpm data:render` drew: the app only shows a sheet that is in it. */
export const DRAWINGS_MANIFEST = "manifest.json";

export type DrawingsManifest = Record<
  string,
  { fingerprint: string; width: number; height: number }
>;

const VARIABLES = {
  endpoint: "DRAWINGS_S3_ENDPOINT",
  bucket: "DRAWINGS_S3_BUCKET",
  accessKeyId: "DRAWINGS_S3_ACCESS_KEY_ID",
  secretAccessKey: "DRAWINGS_S3_SECRET_ACCESS_KEY",
} as const;

/** The bucket of the tiles, null to use the local folder, or an error if it is half set. */
export function drawingsBucket(env: Record<string, string | undefined>): DrawingsBucket | null {
  const entries = Object.entries(VARIABLES).map(
    ([field, name]) => [field, env[name]?.trim() ?? "", name] as const,
  );
  const missing = entries.filter(([, value]) => !value).map(([, , name]) => name);
  if (missing.length === entries.length) return null;
  if (missing.length > 0) {
    throw new Error(`Faltan variables del almacenamiento de los planos: ${missing.join(", ")}.`);
  }
  const bucket = Object.fromEntries(entries.map(([field, value]) => [field, value]));
  return { ...bucket, endpoint: bucket.endpoint!.replace(/\/+$/, "") } as DrawingsBucket;
}

/** URL of an object in path style ("<endpoint>/<bucket>/<key>"), as R2 expects it. */
export function bucketObjectUrl(bucket: DrawingsBucket, key: string): string {
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${bucket.endpoint}/${encodeURIComponent(bucket.bucket)}/${path}`;
}
