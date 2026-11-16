/**
 * `pnpm data:render`: draws the sheets listed in `private-data/extracted/sheets.json` (written by
 * `pnpm data:extract`) as image tiles in `private-data/drawings/`, and the page of each cable of
 * `cables.json` as one image (the original sheet the connection crews check). Only what changed
 * since the last run is drawn again. Both folders are ignored by git: it is the client's.
 *
 * Options: --extracted <folder> --source <folder> --out <folder> --force
 *          --only drawings|cables
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import { projectCableSchema, projectSheetSchema } from "../extract/schema";
import { renderCablePages } from "../render/render-cable-pages";
import { renderSheets } from "../render/render-sheets";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

async function main() {
  const { values } = parseArgs({
    options: {
      extracted: { type: "string", default: path.join(repoRoot, "private-data", "extracted") },
      source: { type: "string", default: path.join(repoRoot, "private-data", "source") },
      out: { type: "string", default: path.join(repoRoot, "private-data", "drawings") },
      force: { type: "boolean", default: false },
      only: { type: "string" },
    },
  });
  if (values.only && values.only !== "drawings" && values.only !== "cables") {
    throw new Error('--only acepta "drawings" o "cables".');
  }
  const read = async (name: string): Promise<unknown> => {
    const file = path.join(path.resolve(values.extracted), name);
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch {
      throw new Error(`No se puede leer ${file}. Ejecuta antes pnpm data:extract.`);
    }
  };
  const out = path.resolve(values.out);
  const common = {
    sourceDir: path.resolve(values.source),
    outDir: out,
    force: values.force,
    onProgress: (message: string) => console.warn(`  ${message}`),
  };
  const report = (
    what: string,
    started: number,
    summary: { rendered: number; unchanged: number; removed: number },
  ) =>
    console.warn(
      `${what}: hecho en ${Math.round((Date.now() - started) / 1000)} s: ${summary.rendered} dibujadas, ` +
        `${summary.unchanged} sin cambios, ${summary.removed} retiradas.`,
    );

  // One after the other: both write the same manifest.
  if (values.only !== "cables") {
    const sheets = z.array(projectSheetSchema).parse(await read("sheets.json"));
    console.warn(`Dibujando ${sheets.length} hojas de plano en ${out}`);
    const started = Date.now();
    report("Planos", started, await renderSheets({ sheets, ...common }));
  }
  if (values.only !== "drawings") {
    const cables = z.array(projectCableSchema).parse(await read("cables.json"));
    console.warn(`Dibujando la hoja de ${cables.length} cables en ${out}`);
    const started = Date.now();
    report("Hojas de cable", started, await renderCablePages({ cables, ...common }));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
