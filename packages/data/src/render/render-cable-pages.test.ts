import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makePdf } from "../testing/make-pdf";
import { renderCablePages, type CablePage } from "./render-cable-pages";
import { renderSheets, type Manifest } from "./render-sheets";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "render-cables-"));
  await writeFile(
    path.join(dir, "electrico.pdf"),
    makePdf([
      { width: 839, height: 1184, texts: [{ text: "99XAT10W2005", x: 100, top: 100 }] },
      { width: 839, height: 1184, texts: [{ text: "99XAT10W2006", x: 100, top: 100 }] },
    ]),
  );
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const cable = (code: string, page: number, sourceFingerprint = "aaaa"): CablePage => ({
  code,
  sourceFile: "electrico.pdf",
  sourcePage: page,
  sourceFingerprint,
});

const out = () => path.join(dir, "drawings");
const manifest = async () =>
  JSON.parse(await readFile(path.join(out(), "manifest.json"), "utf8")) as Manifest;

describe("renderCablePages", () => {
  it("draws each cable page as one image and records it in the manifest", async () => {
    const summary = await renderCablePages({
      cables: [cable("99XAT10W2005", 1)],
      sourceDir: dir,
      outDir: out(),
    });

    expect(summary).toEqual({ rendered: 1, unchanged: 0, removed: 0 });
    const image = await sharp(
      await readFile(path.join(out(), "cable_99XAT10W2005.webp")),
    ).metadata();
    expect(image).toMatchObject({ format: "webp", height: 2600 });
    expect((await manifest()).cable_99XAT10W2005).toEqual({
      fingerprint: "aaaa",
      width: image.width,
      height: 2600,
    });
  });

  it("only draws the pages that changed and removes the cables no longer listed", async () => {
    await renderCablePages({
      cables: [cable("99XAT10W2005", 1), cable("99XAT10W2006", 2)],
      sourceDir: dir,
      outDir: out(),
    });

    const summary = await renderCablePages({
      cables: [cable("99XAT10W2005", 1, "bbbb")],
      sourceDir: dir,
      outDir: out(),
    });

    expect(summary).toEqual({ rendered: 1, unchanged: 0, removed: 1 });
    expect(existsSync(path.join(out(), "cable_99XAT10W2006.webp"))).toBe(false);
    expect(Object.keys(await manifest())).toEqual(["cable_99XAT10W2005"]);
  });

  it("shares the manifest with the drawing sheets without removing them, and the other way round", async () => {
    await writeFile(
      path.join(dir, "planos.pdf"),
      makePdf([{ width: 600, height: 400, texts: [{ text: "015", x: 50, top: 50 }] }]),
    );
    const sheets = [
      {
        drawing: "EJ-ELE-DRW-0024",
        sheet: "02",
        title: null,
        file: "planos.pdf",
        page: 1,
        width: 600,
        height: 400,
        fingerprint: "cccc",
      },
    ];

    await renderSheets({ sheets, sourceDir: dir, outDir: out() });
    await renderCablePages({ cables: [cable("99XAT10W2005", 1)], sourceDir: dir, outDir: out() });
    await renderSheets({ sheets, sourceDir: dir, outDir: out() });

    expect(Object.keys(await manifest()).sort()).toEqual([
      "EJ-ELE-DRW-0024_02",
      "cable_99XAT10W2005",
    ]);
  });
});
