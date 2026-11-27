/**
 * The sheets with the red marks of the quality checks (fase 19). Quality prints the sheets of a
 * routing drawing, marks them in red (the real place of the trays and of the equipment already
 * checked) and scans them: one PDF per drawing, `private-data/source/redmarks/<drawing>….pdf`,
 * with its pages in the same order as the sheets of the drawing.
 *
 * Each page is turned, scaled and moved until it lies exactly on its sheet (`alignPage`), and
 * drawn as tiles of the same size as the sheet, `<sheet key>_redmarks`: the marks of the trays
 * and of the equipment fall on it in the same place. A page that does not lie on its sheet is
 * left out and reported, never drawn on the wrong sheet.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { isRedMarksKey, redMarksKey } from "@cables/shared";
import sharp from "sharp";
import type { ProjectSheet } from "../extract/schema";
import {
  MAX_SIDE,
  TILE_SIZE,
  drawPage,
  readManifest,
  sheetKey,
  standardFontDataUrl,
  type Manifest,
} from "./render-sheets";

/** How a scanned page lies on its sheet: turned, scaled and moved (fractions of the sheet). */
export type Placement = { rotation: number; scale: number; dx: number; dy: number };

/** Below this share of the scan's lines on the sheet's lines, the page is not that sheet. */
export const MIN_FIT = 0.75;
/**
 * How much better the page must fit its sheet than the sheets next to it: the sheets of one
 * building at other heights share frame, title block and walls.
 */
export const MIN_MARGIN = 0.05;

const DARK = 600;

/** The dark pixels of a canvas: the lines of the drawing. */
function darkPixels(canvas: Canvas): Uint8Array {
  const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  const mask = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = data[i * 4]! + data[i * 4 + 1]! + data[i * 4 + 2]! < DARK ? 1 : 0;
  }
  return mask;
}

/** The lines one pixel thicker: a scan is never exact to the pixel. */
function thicken(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      out[i] = mask[i]! | mask[i - 1]! | mask[i + 1]! | mask[i - width]! | mask[i + width]!;
    }
  }
  return out;
}

/** The scan drawn on a canvas of the sheet's size, as `placement` says. */
export function placeScan(scan: Canvas, width: number, height: number, placement: Placement) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.translate(width / 2 + placement.dx * width, height / 2 + placement.dy * height);
  context.rotate((placement.rotation * Math.PI) / 180);
  context.scale(placement.scale, placement.scale);
  // Turned a quarter, the scan fills the sheet with its sides swapped.
  const sideways = placement.rotation % 180 !== 0;
  const [w, h] = sideways ? [height, width] : [width, height];
  context.drawImage(scan, -w / 2, -h / 2, w, h);
  return canvas;
}

/** Share of the scan's lines that fall on the sheet's lines. */
function fit(sheet: Uint8Array, scan: Uint8Array): number {
  let both = 0;
  let lines = 0;
  for (let i = 0; i < scan.length; i += 1) {
    if (scan[i]) {
      lines += 1;
      if (sheet[i]) both += 1;
    }
  }
  return lines === 0 ? 0 : both / lines;
}

/**
 * How alike the scan, placed as found, and a sheet are, both ways: its lines on the sheet's and
 * the sheet's on its own. A sheet with more lines takes all the scan's lines too, so only both
 * ways tell two sheets of one building apart.
 */
export function likeness(sheet: Canvas, scan: Canvas, placement: Placement): number {
  const { width, height } = sheet;
  const sheetLines = darkPixels(sheet);
  const scanLines = darkPixels(placeScan(scan, width, height, placement));
  const precision = fit(thicken(sheetLines, width, height), scanLines);
  const recall = fit(thicken(scanLines, width, height), sheetLines);
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

function search(
  sheet: Canvas,
  scan: Canvas,
  candidates: Iterable<Placement>,
): { placement: Placement; fit: number } {
  const target = thicken(darkPixels(sheet), sheet.width, sheet.height);
  let best = { placement: { rotation: 0, scale: 1, dx: 0, dy: 0 }, fit: -1 };
  for (const placement of candidates) {
    const score = fit(target, darkPixels(placeScan(scan, sheet.width, sheet.height, placement)));
    if (score > best.fit) best = { placement, fit: score };
  }
  return best;
}

function* grid(
  rotations: readonly number[],
  scales: readonly number[],
  shifts: readonly number[],
): Generator<Placement> {
  for (const rotation of rotations) {
    for (const scale of scales) {
      for (const dx of shifts) for (const dy of shifts) yield { rotation, scale, dx, dy };
    }
  }
}

const steps = (from: number, to: number, step: number) =>
  Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => from + i * step);

/**
 * Where a scanned page lies on its sheet: first roughly on small images (the turn that puts it
 * the same way round, a scale and a shift), then finely around the best. `small` and `fine`
 * are the sheet drawn at two sizes; `scan` is the page drawn large enough for both.
 */
export function alignPage(
  sheet: { small: Canvas; fine: Canvas },
  scan: Canvas,
): { placement: Placement; fit: number } {
  const sheetWide = sheet.small.width >= sheet.small.height;
  const scanWide = scan.width >= scan.height;
  const rotations = sheetWide === scanWide ? [0, 180] : [-90, 90];
  const rough = search(
    sheet.small,
    scan,
    grid(rotations, steps(0.94, 1.06, 0.02), steps(-0.02, 0.02, 0.01)),
  );
  const { rotation, scale, dx, dy } = rough.placement;
  const fine: Placement[] = [];
  for (const s of steps(scale - 0.01, scale + 0.01, 0.005)) {
    for (const x of steps(dx - 0.005, dx + 0.005, 0.0025)) {
      for (const y of steps(dy - 0.005, dy + 0.005, 0.0025)) {
        fine.push({ rotation, scale: s, dx: x, dy: y });
      }
    }
  }
  return search(sheet.fine, scan, fine);
}

export type RedMarksSummary = {
  rendered: number;
  unchanged: number;
  removed: number;
  /** Pages left out, and why. */
  skipped: string[];
};

/** «HLB-XXX-DRW-0001 red marks.pdf» → «HLB-XXX-DRW-0001»: the drawing of a scanned PDF. */
export function drawingOfFile(file: string): string | null {
  return (
    /^([A-Z0-9]+(?:-[A-Z0-9]+)*-DRW-\d{4})/i.exec(path.basename(file))?.[1]?.toUpperCase() ?? null
  );
}

const SMALL = 260;
const FINE = 500;
const ALIGN_SIDE = 1000;

export async function renderRedMarks(options: {
  sheets: readonly ProjectSheet[];
  /** Where the routing PDFs named in `sheet.file` are. */
  sourceDir: string;
  /** Where the scanned PDFs are, one per drawing. */
  redMarksDir: string;
  outDir: string;
  force?: boolean;
  onProgress?: (message: string) => void;
}): Promise<RedMarksSummary> {
  const { sheets, sourceDir, redMarksDir, outDir, force = false, onProgress = () => {} } = options;
  await mkdir(outDir, { recursive: true });
  const manifest: Manifest = await readManifest(outDir);
  const summary: RedMarksSummary = { rendered: 0, unchanged: 0, removed: 0, skipped: [] };
  const save = () =>
    writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);

  const files = (await readdir(redMarksDir).catch(() => [] as string[]))
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .sort();
  const wanted = new Set<string>();

  for (const file of files) {
    const drawing = drawingOfFile(file);
    const own = sheets
      .filter((sheet) => sheet.drawing.toUpperCase() === drawing)
      .sort((a, b) => a.page - b.page);
    if (!drawing || own.length === 0) {
      summary.skipped.push(`${file}: el nombre no empieza por un plano que esté cargado.`);
      continue;
    }
    const data = await readFile(path.join(redMarksDir, file));
    const digest = createHash("sha256").update(data).digest("hex").slice(0, 16);
    const first = own[0]!;
    const scannedTask = getDocument({
      data: new Uint8Array(data),
      verbosity: 0,
      standardFontDataUrl,
    });
    const scanned = await scannedTask.promise;
    const routingTask = getDocument({
      data: new Uint8Array(await readFile(path.join(sourceDir, first.file))),
      verbosity: 0,
      standardFontDataUrl,
    });
    const routing = await routingTask.promise;
    try {
      for (let page = 1; page <= scanned.numPages; page += 1) {
        // Same order as the drawing: the page after the first sheet's page.
        const sheet = own.find(
          (item) => item.file === first.file && item.page === first.page + page - 1,
        );
        if (!sheet) {
          summary.skipped.push(`${file} pág. ${page}: no es una hoja del plano ${drawing}.`);
          continue;
        }
        const key = redMarksKey(sheetKey(sheet));
        const fingerprint = `${digest}:${page}:${sheet.fingerprint}`;
        wanted.add(key);
        if (!force && manifest[key]?.fingerprint === fingerprint) {
          summary.unchanged += 1;
          continue;
        }
        // Aligned on a medium copy (every try draws it again), drawn at full size.
        const medium = await drawPage(scanned, page, { maxSide: ALIGN_SIDE, maxScale: 10 });
        const found = alignPage(
          {
            small: await drawPage(routing, sheet.page, { maxSide: SMALL, maxScale: 10 }),
            fine: await drawPage(routing, sheet.page, { maxSide: FINE, maxScale: 10 }),
          },
          medium,
        );
        // The sheets before and after it, placed the same way, must look clearly less alike.
        const fineSheet = await drawPage(routing, sheet.page, { maxSide: FINE, maxScale: 10 });
        const alike = likeness(fineSheet, medium, found.placement);
        let neighbour = 0;
        for (const other of own.filter((item) => Math.abs(item.page - sheet.page) === 1)) {
          const drawnOther = await drawPage(routing, other.page, { maxSide: FINE, maxScale: 10 });
          neighbour = Math.max(neighbour, likeness(drawnOther, medium, found.placement));
        }
        if (found.fit >= MIN_FIT && alike - neighbour < MIN_MARGIN) {
          wanted.delete(key);
          summary.skipped.push(
            `${file} pág. ${page}: se parece casi igual a otra hoja del plano (${Math.round(alike * 100)} % frente a ${Math.round(neighbour * 100)} %).`,
          );
          continue;
        }
        if (found.fit < MIN_FIT) {
          wanted.delete(key);
          summary.skipped.push(
            `${file} pág. ${page}: no encaja con la hoja ${sheet.sheet} (${Math.round(found.fit * 100)} %).`,
          );
          continue;
        }
        // The same size as the sheet's own tiles, so that its marks fall in place.
        const drawn = manifest[sheetKey(sheet)];
        const width = drawn?.width ?? Math.min(MAX_SIDE, Math.round(sheet.width * 3));
        const height = drawn?.height ?? Math.round((width * sheet.height) / sheet.width);
        const scan = await drawPage(scanned, page, {
          maxSide: Math.max(width, height),
          maxScale: 4,
        });
        const image = placeScan(scan, width, height, found.placement);
        await rm(path.join(outDir, `${key}.dzi`), { force: true });
        await rm(path.join(outDir, `${key}_files`), { recursive: true, force: true });
        await sharp(image.toBuffer("image/png"), { limitInputPixels: false })
          .webp({ quality: 80 })
          .tile({ size: TILE_SIZE, overlap: 1, layout: "dz" })
          .toFile(path.join(outDir, `${key}.dz`));
        manifest[key] = { fingerprint, width, height };
        summary.rendered += 1;
        onProgress(
          `${drawing} hoja ${sheet.sheet}: encaja al ${Math.round(found.fit * 100)} % ` +
            `(giro ${found.placement.rotation}°, escala ${found.placement.scale.toFixed(3)}; ` +
            `parecido ${Math.round(alike * 100)} %, la hoja vecina ${Math.round(neighbour * 100)} %)`,
        );
        await save();
      }
    } finally {
      await scannedTask.destroy();
      await routingTask.destroy();
    }
  }

  for (const key of Object.keys(manifest)) {
    if (!isRedMarksKey(key) || wanted.has(key)) continue;
    await rm(path.join(outDir, `${key}.dzi`), { force: true });
    await rm(path.join(outDir, `${key}_files`), { recursive: true, force: true });
    delete manifest[key];
    summary.removed += 1;
  }
  await save();
  return summary;
}
