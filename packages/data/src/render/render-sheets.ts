/**
 * Draws every sheet of the routing drawings as Deep Zoom tiles (`<key>.dzi` + `<key>_files/`):
 * the viewer downloads only the tiles on screen, so an A0 sheet opens on a phone without
 * loading the whole image. The tiles are the client's drawings: they go to
 * `private-data/drawings/`, which git ignores, and the app serves them only to signed-in users.
 *
 * A manifest keeps the fingerprint of each sheet (see `parseDrawingSheet`): a sheet whose text
 * did not change is not drawn again, and tiles of sheets that are gone are removed.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp from "sharp";
import type { ProjectSheet } from "../extract/schema";

/** Longest side of a rendered sheet, in pixels: enough to read the codes on an A0 sheet. */
export const MAX_SIDE = 8192;
const MAX_SCALE = 3;
export const TILE_SIZE = 512;

export type SheetImage = {
  fingerprint: string;
  width: number;
  height: number;
};

export type Manifest = Record<string, SheetImage>;

export type RenderSummary = { rendered: number; unchanged: number; removed: number };

/** Folder-safe key of a sheet: also the name of its tiles. */
export const sheetKey = (sheet: { drawing: string; sheet: string }) =>
  `${sheet.drawing}_${sheet.sheet}`.replace(/[^A-Za-z0-9_-]/g, "-");

const require = createRequire(import.meta.url);
/** pdf.js needs the standard fonts for drawings that do not embed theirs. */
const standardFontDataUrl = `${path
  .join(path.dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts")
  .replaceAll("\\", "/")}/`;

async function readManifest(outDir: string): Promise<Manifest> {
  try {
    return JSON.parse(await readFile(path.join(outDir, "manifest.json"), "utf8")) as Manifest;
  } catch {
    return {};
  }
}

export async function renderSheets(options: {
  sheets: readonly ProjectSheet[];
  /** Where the PDFs named in `sheet.file` are. */
  sourceDir: string;
  outDir: string;
  /** Draw every sheet again, even the unchanged ones. */
  force?: boolean;
  onProgress?: (message: string) => void;
}): Promise<RenderSummary> {
  const { sheets, sourceDir, outDir, force = false, onProgress = () => {} } = options;
  await mkdir(outDir, { recursive: true });
  const manifest = await readManifest(outDir);
  const summary: RenderSummary = { rendered: 0, unchanged: 0, removed: 0 };

  const wanted = new Map(sheets.map((sheet) => [sheetKey(sheet), sheet]));
  for (const key of Object.keys(manifest)) {
    if (wanted.has(key)) continue;
    await removeTiles(outDir, key);
    delete manifest[key];
    summary.removed += 1;
  }

  const pending = [...wanted.entries()].filter(
    ([key, sheet]) => force || manifest[key]?.fingerprint !== sheet.fingerprint,
  );
  summary.unchanged = wanted.size - pending.length;

  // One PDF open at a time: the drawings are huge.
  const byFile = new Map<string, [string, ProjectSheet][]>();
  for (const entry of pending) {
    byFile.set(entry[1].file, [...(byFile.get(entry[1].file) ?? []), entry]);
  }
  for (const [file, entries] of byFile) {
    const data = new Uint8Array(await readFile(path.join(sourceDir, file)));
    const task = getDocument({ data, verbosity: 0, standardFontDataUrl });
    const document = await task.promise;
    try {
      for (const [key, sheet] of entries) {
        const page = await document.getPage(sheet.page);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(MAX_SCALE, MAX_SIDE / Math.max(base.width, base.height));
        const viewport = page.getViewport({ scale });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        // @napi-rs/canvas follows the browser canvas API that pdf.js expects.
        type RenderParameters = Parameters<typeof page.render>[0];
        await page.render({
          canvasContext: context as unknown as RenderParameters["canvasContext"],
          canvas: canvas as unknown as RenderParameters["canvas"],
          viewport,
        }).promise;
        page.cleanup();

        await removeTiles(outDir, key);
        await sharp(canvas.toBuffer("image/png"), { limitInputPixels: false })
          .webp({ quality: 80 })
          .tile({ size: TILE_SIZE, overlap: 1, layout: "dz" })
          .toFile(path.join(outDir, `${key}.dz`));
        manifest[key] = {
          fingerprint: sheet.fingerprint,
          width: canvas.width,
          height: canvas.height,
        };
        summary.rendered += 1;
        onProgress(`${sheet.drawing} hoja ${sheet.sheet}: ${canvas.width} × ${canvas.height} px`);
        // Saved after every sheet: an interrupted run does not redo what it already drew.
        await writeFile(
          path.join(outDir, "manifest.json"),
          `${JSON.stringify(manifest, null, 1)}\n`,
        );
      }
    } finally {
      await task.destroy();
    }
  }
  await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);
  return summary;
}

async function removeTiles(outDir: string, key: string) {
  await rm(path.join(outDir, `${key}.dzi`), { force: true });
  await rm(path.join(outDir, `${key}_files`), { recursive: true, force: true });
}
