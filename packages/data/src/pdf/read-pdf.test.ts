import { describe, expect, it } from "vitest";
import { makePdf } from "../testing/make-pdf";
import { compact, findLabel, lines } from "./layout";
import { countPdfPages, readPdfPages } from "./read-pdf";

async function readAll(data: Uint8Array) {
  const pages = [];
  for await (const page of readPdfPages(data)) pages.push(page);
  return pages;
}

describe("readPdfPages", () => {
  it("returns each run of text with its position from the top-left corner", async () => {
    const [page] = await readAll(
      makePdf([
        {
          width: 600,
          height: 800,
          texts: [
            { text: "CABLE ID", x: 20, top: 70 },
            { text: "99XAT10W2005", x: 140, top: 70 },
            { text: "   ", x: 300, top: 70 },
          ],
        },
      ]),
    );

    expect(page).toMatchObject({ number: 1, width: 600, height: 800 });
    expect(page!.runs.map((run) => run.text)).toEqual(["CABLE ID", "99XAT10W2005"]);
    const [label, value] = page!.runs;
    expect(label!.x0).toBeCloseTo(20, 0);
    expect(label!.top).toBeCloseTo(70, 0);
    expect(label!.size).toBeCloseTo(10, 0);
    // Helvetica widths: the run ends after its text.
    expect(value!.x1).toBeGreaterThan(value!.x0 + 50);
  });

  it("gives the centre and direction of each run, also when it is rotated", async () => {
    const [page] = await readAll(
      makePdf([
        {
          width: 600,
          height: 800,
          texts: [
            { text: "AAAAAAAAAA", x: 100, top: 100, size: 10 },
            { text: "BBBBBBBBBB", x: 300, top: 500, size: 10, angle: 90 },
          ],
        },
      ]),
    );
    const [flat, upwards] = page!.runs;

    expect(flat!.angle).toBe(0);
    expect(flat!.cx).toBeCloseTo((flat!.x0 + flat!.x1) / 2, 0);
    expect(flat!.cy).toBeCloseTo(105, 0);
    // Written upwards from its baseline: the centre is above it and half a line to the left.
    expect(upwards!.angle).toBe(90);
    const length = upwards!.x1 - upwards!.x0;
    expect(upwards!.cx).toBeCloseTo(300 - 5, 0);
    expect(upwards!.cy).toBeCloseTo(800 - (800 - 500 - 10) - length / 2, 0);
  });

  it("reads the pages in order and counts them", async () => {
    const data = makePdf(
      [1, 2, 3].map((number) => ({
        width: 300,
        height: 300,
        texts: [{ text: `Página ${number}`.replace("á", "a"), x: 10, top: 10 }],
      })),
    );

    expect(await countPdfPages(data.slice())).toBe(3);
    const pages = await readAll(data);
    expect(pages.map((page) => page.runs[0]?.text)).toEqual(["Pagina 1", "Pagina 2", "Pagina 3"]);
  });
});

describe("layout helpers", () => {
  const runs = [
    { text: "Equipment ID", x0: 10, x1: 60, top: 100, size: 10, cx: 0, cy: 0, angle: 0 },
    { text: ":", x0: 61, x1: 63, top: 100, size: 10, cx: 0, cy: 0, angle: 0 },
    { text: "99BMA", x0: 100, x1: 130, top: 100.5, size: 10, cx: 0, cy: 0, angle: 0 },
    { text: "Gland:", x0: 30, x1: 60, top: 110, size: 10, cx: 0, cy: 0, angle: 0 },
  ];

  it("groups runs into lines and compares labels without spaces or punctuation", () => {
    expect(lines(runs).map((line) => line.map((run) => run.text))).toEqual([
      ["Equipment ID", ":", "99BMA"],
      ["Gland:"],
    ]);
    expect(compact(" Equipment ID: ")).toBe("EQUIPMENTID");
  });

  it("finds a label split in several runs, and honours the area filter", () => {
    // The ":" does not count, so the label ends with "Equipment ID".
    expect(findLabel(runs, "Equipment ID:")).toEqual({ x0: 10, x1: 60, top: 100 });
    expect(findLabel(runs, "Gland:", (box) => box.top < 105)).toBeNull();
    expect(findLabel(runs, "Cubicle:")).toBeNull();
  });
});
