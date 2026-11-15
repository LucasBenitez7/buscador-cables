/**
 * `pnpm data:upload`: sends the tiles of `private-data/drawings/` (drawn by `pnpm data:render`)
 * to the private bucket of production, set with the `DRAWINGS_S3_*` variables (see
 * `.env.example` and docs/DESPLIEGUE.md). Only the sheets that changed go up.
 *
 * Options: --dir <folder> --force
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { drawingsBucket } from "@cables/shared";
import { uploadDrawings } from "../render/upload";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

async function main() {
  const { values } = parseArgs({
    options: {
      dir: { type: "string", default: path.join(repoRoot, "private-data", "drawings") },
      force: { type: "boolean", default: false },
    },
  });
  const bucket = drawingsBucket(process.env);
  if (!bucket) {
    throw new Error("Define las variables DRAWINGS_S3_* (ver .env.example) para subir los planos.");
  }
  const dir = path.resolve(values.dir);
  console.warn(`Subiendo los planos de ${dir} a ${bucket.endpoint}/${bucket.bucket}`);

  const started = Date.now();
  const summary = await uploadDrawings({
    dir,
    bucket,
    force: values.force,
    onProgress: (message) => console.warn(`  ${message}`),
  });
  console.warn(
    `Hecho en ${Math.round((Date.now() - started) / 1000)} s: ${summary.uploaded} hojas subidas ` +
      `(${summary.files} ficheros), ${summary.unchanged} sin cambios, ${summary.removed} retiradas.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
