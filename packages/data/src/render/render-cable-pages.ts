/**
 * Draws the page of each cable in its list as one WebP image (`<key>.webp`, see
 * `cableSheetKey`), so the connection crews can check the original sheet in the app (fase 11).
 * A cable page is small (A4/A3): one image of a few hundred KB opens at once and zooms well,
 * without the thousands of tiles of the drawings.
 *
 * Like `renderSheets`, it keeps a fingerprint per page in the shared manifest and only draws
 * the pages whose text changed; images of cables no longer listed are removed.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { cableSheetKey, isCableSheetKey } from "@cables/shared";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import sharp from "sharp";
import type { ProjectCable } from "../extract/schema";
import {
  drawPage,
  readManifest,
  standardFontDataUrl,
  type Manifest,
  type RenderSummary,
} from "./render-sheets";

/** Longest side of a cable page, in pixels: the 6-point text of the lists stays sharp. */
export const CABLE_PAGE_MAX_SIDE = 2600;
const MAX_SCALE = 4;

export type CablePage = Pick<
  ProjectCable,
  "code" | "sourceFile" | "sourcePage" | "sourceFingerprint"
>;

export async function renderCablePages(options: {
  cables: readonly CablePage[];
  sourceDir: string;
  outDir: string;
  force?: boolean;
  onProgress?: (message: string) => void;
}): Promise<RenderSummary> {
  const { cables, sourceDir, outDir, force = false, onProgress = () => {} } = options;
  await mkdir(outDir, { recursive: true });
  const manifest: Manifest = await readManifest(outDir);
  const summary: RenderSummary = { rendered: 0, unchanged: 0, removed: 0 };
  const save = () =>
    writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);

  const wanted = new Map(cables.map((cable) => [cableSheetKey(cable.code), cable]));
  for (const key of Object.keys(manifest)) {
    if (!isCableSheetKey(key) || wanted.has(key)) continue;
    await rm(path.join(outDir, `${key}.webp`), { force: true });
    delete manifest[key];
    summary.removed += 1;
  }

  const pending = [...wanted.entries()].filter(
    ([key, cable]) => force || manifest[key]?.fingerprint !== cable.sourceFingerprint,
  );
  summary.unchanged = wanted.size - pending.length;

  const byFile = new Map<string, [string, CablePage][]>();
  for (const entry of pending) {
    byFile.set(entry[1].sourceFile, [...(byFile.get(entry[1].sourceFile) ?? []), entry]);
  }
  for (const [file, entries] of byFile) {
    const data = new Uint8Array(await readFile(path.join(sourceDir, file)));
    const task = getDocument({ data, verbosity: 0, standardFontDataUrl });
    const document = await task.promise;
    try {
      for (const [key, cable] of entries) {
        const canvas = await drawPage(document, cable.sourcePage, {
          maxSide: CABLE_PAGE_MAX_SIDE,
          maxScale: MAX_SCALE,
        });
        await sharp(canvas.toBuffer("image/png"))
          .webp({ quality: 80 })
          .toFile(path.join(outDir, `${key}.webp`));
        manifest[key] = {
          fingerprint: cable.sourceFingerprint,
          width: canvas.width,
          height: canvas.height,
        };
        summary.rendered += 1;
        // Saved every few pages: an interrupted run does not redo what it already drew.
        if (summary.rendered % 50 === 0) {
          await save();
          onProgress(`Hojas de cable: ${summary.rendered} de ${pending.length}`);
        }
      }
    } finally {
      await task.destroy();
    }
  }
  await save();
  return summary;
}
