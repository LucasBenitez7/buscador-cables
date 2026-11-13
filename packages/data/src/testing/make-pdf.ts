/**
 * Test helper: writes a minimal PDF with text at given positions, in Helvetica. Lets the
 * tests build invented cable sheets and drawings in memory instead of storing PDFs.
 */
export type PdfText = {
  text: string;
  x: number;
  /** Distance from the top of the page to the top of the text, like `TextRun.top`. */
  top: number;
  size?: number;
};

export type PdfPageSpec = { width: number; height: number; texts: PdfText[] };

const escape = (text: string) => text.replace(/[\\()]/g, (char) => `\\${char}`);

export function makePdf(pages: readonly PdfPageSpec[]): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const catalog = add("");
  const pageTree = add("");
  const font = add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  const pageIds = pages.map((page) => {
    const stream = page.texts
      .map(({ text, x, top, size = 10 }) => {
        const y = page.height - top - size;
        return `BT /F1 ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escape(text)}) Tj ET`;
      })
      .join("\n");
    const content = add(
      `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    );
    return add(
      `<< /Type /Page /Parent ${pageTree} 0 R /MediaBox [0 0 ${page.width} ${page.height}] ` +
        `/Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`,
    );
  });
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pageTree} 0 R >>`;
  objects[pageTree - 1] =
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let output = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(output, "latin1"));
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output, "latin1");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(output, "latin1"));
}
