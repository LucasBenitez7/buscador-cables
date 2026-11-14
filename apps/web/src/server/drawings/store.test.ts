// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/drawings/[...path]/route";
import { drawingFilePath, drawingsDir, hasDrawingImage, readDrawingFile } from "./store";

const { currentUser } = vi.hoisted(() => ({ currentUser: vi.fn() }));
vi.mock("@/server/session", () => ({ getCurrentUser: currentUser }));

let dir: string;
const previous = process.env.DRAWINGS_DIR;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "drawings-"));
  process.env.DRAWINGS_DIR = dir;
  await writeFile(path.join(dir, "EJ-ELE-DRW-0024_02.dzi"), "<Image/>");
  await mkdir(path.join(dir, "EJ-ELE-DRW-0024_02_files", "12"), { recursive: true });
  await writeFile(path.join(dir, "EJ-ELE-DRW-0024_02_files", "12", "3_4.webp"), "tile");
  // Fuera de las teselas: nunca se sirve.
  await writeFile(path.join(dir, "manifest.json"), "{}");
});

afterAll(async () => {
  process.env.DRAWINGS_DIR = previous;
  await rm(dir, { recursive: true, force: true });
});

describe("drawingFilePath", () => {
  it("accepts only a sheet descriptor or one of its tiles", () => {
    expect(drawingFilePath(["EJ-ELE-DRW-0024_02.dzi"])).toBe("EJ-ELE-DRW-0024_02.dzi");
    expect(drawingFilePath(["EJ-ELE-DRW-0024_02_files", "12", "3_4.webp"])).toBe(
      path.join("EJ-ELE-DRW-0024_02_files", "12", "3_4.webp"),
    );
  });

  it("refuses anything that could leave the tiles folder", () => {
    for (const segments of [
      ["manifest.json"],
      ["..", "..", ".env"],
      ["../secret.dzi"],
      ["EJ_files", "..", "3_4.webp"],
      ["EJ_files", "12", "../../x.webp"],
      ["EJ_files", "12", "3_4.png"],
      [],
    ]) {
      expect(drawingFilePath(segments)).toBeNull();
    }
  });

  it("resolves a relative DRAWINGS_DIR from the repository root", () => {
    process.env.DRAWINGS_DIR = "private-data/drawings";
    expect(drawingsDir()).toMatch(/private-data[\\/]drawings$/);
    expect(path.isAbsolute(drawingsDir())).toBe(true);
    process.env.DRAWINGS_DIR = dir;
  });
});

describe("readDrawingFile", () => {
  it("reads descriptors and tiles with their content type", async () => {
    await expect(readDrawingFile(["EJ-ELE-DRW-0024_02.dzi"])).resolves.toMatchObject({
      contentType: "application/xml",
    });
    const tile = await readDrawingFile(["EJ-ELE-DRW-0024_02_files", "12", "3_4.webp"]);
    expect(tile?.contentType).toBe("image/webp");
    expect(tile?.body.toString()).toBe("tile");
    await expect(readDrawingFile(["NADA_02.dzi"])).resolves.toBeNull();
  });

  it("knows which sheets are drawn", async () => {
    await expect(hasDrawingImage("EJ-ELE-DRW-0024_02")).resolves.toBe(true);
    await expect(hasDrawingImage("EJ-ELE-DRW-0024_03")).resolves.toBe(false);
    await expect(hasDrawingImage("../x")).resolves.toBe(false);
  });
});

describe("GET /api/drawings", () => {
  const get = (segments: string[]) =>
    GET(new Request("http://localhost/api/drawings"), {
      params: Promise.resolve({ path: segments }),
    });

  it("refuses requests without a session", async () => {
    currentUser.mockResolvedValue(null);

    const response = await get(["EJ-ELE-DRW-0024_02.dzi"]);

    expect(response.status).toBe(401);
  });

  it("serves a tile privately to a signed-in user, and 404 for the rest", async () => {
    currentUser.mockResolvedValue({ id: "u1", role: "VIEWER" });

    const response = await get(["EJ-ELE-DRW-0024_02_files", "12", "3_4.webp"]);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");
    expect((await get(["manifest.json"])).status).toBe(404);
  });
});
