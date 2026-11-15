import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectSheet } from "../extract/schema";
import { makePdf } from "../testing/make-pdf";
import { renderSheets, sheetKey, type Manifest } from "./render-sheets";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "render-"));
  await writeFile(
    path.join(dir, "planos.pdf"),
    makePdf([
      { width: 600, height: 400, texts: [{ text: "99UXA00L22036", x: 100, top: 100 }] },
      { width: 400, height: 600, texts: [{ text: "015", x: 50, top: 50 }] },
    ]),
  );
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const sheet = (overrides: Partial<ProjectSheet> = {}): ProjectSheet => ({
  drawing: "EJ-ELE-DRW-0024",
  sheet: "02",
  title: null,
  file: "planos.pdf",
  page: 1,
  width: 600,
  height: 400,
  fingerprint: "aaaa",
  ...overrides,
});

const out = () => path.join(dir, "drawings");
const manifest = async () =>
  JSON.parse(await readFile(path.join(out(), "manifest.json"), "utf8")) as Manifest;

describe("renderSheets", () => {
  it("draws each sheet as Deep Zoom tiles and records it in the manifest", async () => {
    const summary = await renderSheets({ sheets: [sheet()], sourceDir: dir, outDir: out() });

    expect(summary).toEqual({ rendered: 1, unchanged: 0, removed: 0 });
    const dzi = await readFile(path.join(out(), "EJ-ELE-DRW-0024_02.dzi"), "utf8");
    expect(dzi).toContain('Format="webp"');
    expect(await readdir(path.join(out(), "EJ-ELE-DRW-0024_02_files"))).not.toHaveLength(0);
    // 600 × 400 points at the highest scale (3): 1800 × 1200 pixels.
    expect((await manifest())["EJ-ELE-DRW-0024_02"]).toEqual({
      fingerprint: "aaaa",
      width: 1800,
      height: 1200,
    });
  });

  it("only draws again the sheets whose fingerprint changed, and removes the ones gone", async () => {
    const other = sheet({ sheet: "03", page: 2, width: 400, height: 600, fingerprint: "bbbb" });
    await renderSheets({ sheets: [sheet(), other], sourceDir: dir, outDir: out() });

    const again = await renderSheets({
      sheets: [sheet({ fingerprint: "cccc" })],
      sourceDir: dir,
      outDir: out(),
    });

    expect(again).toEqual({ rendered: 1, unchanged: 0, removed: 1 });
    expect(existsSync(path.join(out(), "EJ-ELE-DRW-0024_03.dzi"))).toBe(false);
    expect(Object.keys(await manifest())).toEqual(["EJ-ELE-DRW-0024_02"]);

    const unchanged = await renderSheets({
      sheets: [sheet({ fingerprint: "cccc" })],
      sourceDir: dir,
      outDir: out(),
    });
    expect(unchanged).toEqual({ rendered: 0, unchanged: 1, removed: 0 });
  });

  it("keeps the key safe to use as a file name", () => {
    expect(sheetKey({ drawing: "EJ/../ELE DRW", sheet: "02" })).toBe("EJ----ELE-DRW_02");
  });
});
