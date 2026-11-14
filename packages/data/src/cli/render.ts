/**
 * `pnpm data:render`: draws the sheets listed in `private-data/extracted/sheets.json` (written by
 * `pnpm data:extract`) as image tiles in `private-data/drawings/`. Only the sheets that changed
 * since the last run are drawn again. Both folders are ignored by git: the drawings are the
 * client's.
 *
 * Options: --extracted <folder> --source <folder> --out <folder> --force
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import { projectSheetSchema } from "../extract/schema";
import { renderSheets } from "../render/render-sheets";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

async function main() {
  const { values } = parseArgs({
    options: {
      extracted: { type: "string", default: path.join(repoRoot, "private-data", "extracted") },
      source: { type: "string", default: path.join(repoRoot, "private-data", "source") },
      out: { type: "string", default: path.join(repoRoot, "private-data", "drawings") },
      force: { type: "boolean", default: false },
    },
  });
  const file = path.join(path.resolve(values.extracted), "sheets.json");
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new Error(`No se puede leer ${file}. Ejecuta antes pnpm data:extract.`);
  }
  const sheets = z.array(projectSheetSchema).parse(raw);
  const out = path.resolve(values.out);
  console.warn(`Dibujando ${sheets.length} hojas de plano en ${out}`);

  const started = Date.now();
  const summary = await renderSheets({
    sheets,
    sourceDir: path.resolve(values.source),
    outDir: out,
    force: values.force,
    onProgress: (message) => console.warn(`  ${message}`),
  });
  console.warn(
    `Hecho en ${Math.round((Date.now() - started) / 1000)} s: ${summary.rendered} dibujadas, ` +
      `${summary.unchanged} sin cambios, ${summary.removed} retiradas.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
