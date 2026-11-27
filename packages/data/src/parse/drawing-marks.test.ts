import { describe, expect, it } from "vitest";
import type { PdfPage, TextRun } from "../pdf/read-pdf";
import { drawnTags } from "./drawing-marks";

// Datos inventados: unidad 99.
const run = (text: string, cx: number, cy: number, angle = 0): TextRun => ({
  text,
  x0: cx - text.length * 2,
  x1: cx + text.length * 2,
  top: cy - 3,
  size: 5,
  cx,
  cy,
  angle,
});
const page = (runs: TextRun[]): PdfPage => ({
  number: 1,
  width: 1000,
  height: 500,
  runs,
  fingerprint: "f",
});

describe("drawnTags", () => {
  it("reads the plant codes on a sheet with where they are, without the trays", () => {
    const tags = drawnTags(
      page([
        run("99CJU17", 100, 50),
        run("+99BMD04.", 300, 100),
        run("99EKH21GH010 U 200", 500, 250),
        // Una bandeja y textos que no son de planta.
        run("99UXA00L22036", 700, 300),
        run("MATCHLINE SHEET 04", 800, 400),
      ]),
    );

    expect(tags.map((item) => item.tag)).toEqual(["99CJU17", "99BMD04", "99EKH21GH010"]);
    expect(tags[0]).toEqual({ tag: "99CJU17", x: 0.1, y: 0.1, w: expect.any(Number), h: 0.012 });
  });

  it("makes the box of a code written upwards tall and narrow", () => {
    const [upright] = drawnTags(page([run("99CJU17", 100, 50, 90)]));

    expect(upright!.h).toBeGreaterThan(upright!.w);
  });
});
