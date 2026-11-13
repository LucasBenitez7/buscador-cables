import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** A run of text as the PDF draws it: a table cell, a label, a value. */
export type TextRun = {
  text: string;
  x0: number;
  x1: number;
  /** Distance from the top of the page to the top of the text. */
  top: number;
  size: number;
};

export type PdfPage = {
  /** 1-based. */
  number: number;
  width: number;
  height: number;
  runs: TextRun[];
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
      const { width, height } = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const runs: TextRun[] = [];
      for (const item of content.items) {
        if (!isTextItem(item)) continue;
        // NFKC: "μ" and "µ" (and other look-alikes) become the same character.
        const text = item.str.normalize("NFKC").replace(/\s+/g, " ").trim();
        if (text === "") continue;
        const [scaleX = 0, skewY = 0, , scaleY = 0, x = 0, y = 0] = item.transform;
        const size = Math.hypot(scaleY, skewY) || Math.abs(scaleX);
        runs.push({ text, x0: x, x1: x + item.width, top: height - y - size, size });
      }
      page.cleanup();
      yield { number, width, height, runs };
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
