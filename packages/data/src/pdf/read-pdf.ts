import { createHash } from "node:crypto";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** A run of text as the PDF draws it: a table cell, a label, a value. */
export type TextRun = {
  text: string;
  x0: number;
  x1: number;
  /** Distance from the top of the page to the top of the text. */
  top: number;
  size: number;
  /** Centre of the text from the top-left corner, also for rotated text (drawings). */
  cx: number;
  cy: number;
  /** Direction of the text in degrees, counter-clockwise: 0 reads left to right, 90 upwards. */
  angle: number;
};

export type PdfPage = {
  /** 1-based. */
  number: number;
  width: number;
  height: number;
  runs: TextRun[];
  /**
   * Hash of the raw text and its position as the PDF draws it: changes when the sheet changes
   * (a new revision adds a row to the title block), not when this code reads it differently.
   */
  fingerprint: string;
};

type TextItem = { str: string; transform: number[]; width: number };

const isTextItem = (item: unknown): item is TextItem =>
  typeof item === "object" && item !== null && "str" in item && "transform" in item;

/**
 * Reads the text of every page with its position, one page at a time (the drawings are
 * huge). Blank runs are dropped; nothing is rendered, so no canvas is needed.
 */
export async function* readPdfPages(data: Uint8Array): AsyncGenerator<PdfPage> {
  const task = getDocument({ data, verbosity: 0 });
  const document = await task.promise;
  try {
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const { width, height } = viewport;
      const content = await page.getTextContent();
      const runs: TextRun[] = [];
      const hash = createHash("sha256").update(`${Math.round(width)}x${Math.round(height)}`);
      for (const item of content.items) {
        if (!isTextItem(item)) continue;
        hash.update(`|${item.str}@${item.transform.map((value) => Math.round(value)).join(",")}`);
        // NFKC: "μ" and "µ" (and other look-alikes) become the same character.
        const text = item.str.normalize("NFKC").replace(/\s+/g, " ").trim();
        if (text === "") continue;
        const [scaleX = 0, skewY = 0, skewX = 0, scaleY = 0, x = 0, y = 0] = item.transform;
        const size = Math.hypot(scaleY, skewY) || Math.abs(scaleX);
        // Centre: half the width along the text and half the size across it, in PDF space;
        // the viewport turns it into top-left coordinates (and handles page offsets).
        const along = Math.hypot(scaleX, skewY) || 1;
        const across = Math.hypot(skewX, scaleY) || 1;
        const centre = viewport.convertToViewportPoint(
          x + (scaleX / along) * (item.width / 2) + (skewX / across) * (size / 2),
          y + (skewY / along) * (item.width / 2) + (scaleY / across) * (size / 2),
        ) as [number, number];
        const angle = Math.round((Math.atan2(skewY, scaleX) * 180) / Math.PI);
        runs.push({
          text,
          x0: x,
          x1: x + item.width,
          top: height - y - size,
          size,
          cx: centre[0],
          cy: centre[1],
          // `+ 0` turns -0 into 0.
          angle: angle + 0,
        });
      }
      page.cleanup();
      yield { number, width, height, runs, fingerprint: hash.digest("hex").slice(0, 16) };
    }
  } finally {
    await task.destroy();
  }
}

/** Number of pages, without reading their text. */
export async function countPdfPages(data: Uint8Array): Promise<number> {
  const task = getDocument({ data, verbosity: 0 });
  const pages = (await task.promise).numPages;
  await task.destroy();
  return pages;
}
