// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/drawings/[...path]/route";
import { DRAWING_ACCESS_SECONDS, createDrawingAccess, hasDrawingAccess } from "./access";
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
  await writeFile(path.join(dir, "cable_99XAT10W2005.webp"), "hoja");
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
      "EJ-ELE-DRW-0024_02_files/12/3_4.webp",
    );
  });

  it("accepts the single image of a cable page, and no other single image", () => {
    expect(drawingFilePath(["cable_99XAT10W2005.webp"])).toBe("cable_99XAT10W2005.webp");
    expect(drawingFilePath(["EJ-ELE-DRW-0024_02.webp"])).toBeNull();
    expect(drawingFilePath(["cable_../x.webp"])).toBeNull();
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
    await expect(hasDrawingImage("cable_99XAT10W2005")).resolves.toBe(true);
    await expect(hasDrawingImage("cable_99XAT10W2006")).resolves.toBe(false);
  });
});

describe("GET /api/drawings", () => {
  const TILE = ["EJ-ELE-DRW-0024_02_files", "12", "3_4.webp"];
  const get = (segments: string[], headers: Record<string, string> = {}) =>
    GET(new NextRequest("http://localhost/api/drawings", { headers }), {
      params: Promise.resolve({ path: segments }),
    });
  const passFrom = (response: Response) =>
    /drawing_access=([^;]+)/.exec(response.headers.get("Set-Cookie") ?? "")?.[1];

  beforeEach(() => currentUser.mockReset());

  it("refuses requests without a session", async () => {
    currentUser.mockResolvedValue(null);

    const response = await get(["EJ-ELE-DRW-0024_02.dzi"]);

    expect(response.status).toBe(401);
  });

  it("serves a tile privately to a signed-in user, and 404 for the rest", async () => {
    currentUser.mockResolvedValue({ id: "u1", role: "VIEWER" });

    const response = await get(TILE);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
    expect((await get(["manifest.json"])).status).toBe(404);
  });

  // Revisión F7.5, M2: cada tesela consultaba la sesión en la base de datos.
  it("checks the session once per sheet and lets its tiles through with the signed pass", async () => {
    currentUser.mockResolvedValue({ id: "u1", role: "VIEWER" });
    const descriptor = await get(["EJ-ELE-DRW-0024_02.dzi"]);
    const pass = passFrom(descriptor);
    expect(pass).toBeDefined();
    expect(descriptor.headers.get("Set-Cookie")).toMatch(/HttpOnly/i);
    expect(descriptor.headers.get("Set-Cookie")).toMatch(/Path=\/api\/drawings/);
    currentUser.mockClear();

    const tile = await get(TILE, { Cookie: `drawing_access=${pass}` });

    expect(tile.status).toBe(200);
    expect(currentUser).not.toHaveBeenCalled();
    expect(tile.headers.get("Set-Cookie")).toBeNull();
  });

  it("serves the image of a cable page only with a session, never with the pass alone", async () => {
    const pass = createDrawingAccess();
    currentUser.mockResolvedValue(null);
    expect(
      (await get(["cable_99XAT10W2005.webp"], { Cookie: `drawing_access=${pass}` })).status,
    ).toBe(401);

    currentUser.mockResolvedValue({ id: "u1", role: "VIEWER" });
    const response = await get(["cable_99XAT10W2005.webp"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
  });

  it("never opens a sheet with the pass alone, nor tiles with a forged or expired one", async () => {
    currentUser.mockResolvedValue(null);
    const pass = createDrawingAccess();
    const expired = createDrawingAccess(Date.now() - (DRAWING_ACCESS_SECONDS + 1) * 1000);
    const forged = `${pass.slice(0, 11)}${"A".repeat(43)}`;

    expect(
      (await get(["EJ-ELE-DRW-0024_02.dzi"], { Cookie: `drawing_access=${pass}` })).status,
    ).toBe(401);
    for (const value of [expired, forged, "basura"]) {
      expect((await get(TILE, { Cookie: `drawing_access=${value}` })).status).toBe(401);
    }
  });

  // Revisión F7.5, M4: con `max-age=3600` el navegador las servía sin preguntar tras cerrar sesión.
  it("answers 304 to a revalidation, and only after checking the access", async () => {
    currentUser.mockResolvedValue({ id: "u1", role: "VIEWER" });
    const first = await get(TILE);
    const etag = first.headers.get("ETag")!;
    expect(etag).toMatch(/^"[\w-]+"$/);

    const again = await get(TILE, { "If-None-Match": etag });
    expect(again.status).toBe(304);
    expect(again.headers.get("ETag")).toBe(etag);

    currentUser.mockResolvedValue(null);
    expect((await get(TILE, { "If-None-Match": etag })).status).toBe(401);
  });
});

describe("hasDrawingAccess", () => {
  it("accepts a pass until it expires", () => {
    const now = Date.UTC(2026, 10, 15, 8, 0, 0);
    const pass = createDrawingAccess(now);

    expect(hasDrawingAccess(pass, now)).toBe(true);
    expect(hasDrawingAccess(pass, now + (DRAWING_ACCESS_SECONDS - 1) * 1000)).toBe(true);
    expect(hasDrawingAccess(pass, now + DRAWING_ACCESS_SECONDS * 1000)).toBe(false);
    expect(hasDrawingAccess(undefined, now)).toBe(false);
  });
});

// Fase 10: en producción las teselas están en un bucket privado de R2.
describe("drawings in a bucket", () => {
  const objects = new Map<string, string>([
    ["planos/manifest.json", JSON.stringify({ "EJ-ELE-DRW-0024_02": { fingerprint: "a" } })],
    ["planos/EJ-ELE-DRW-0024_02.dzi", "<Image/>"],
    ["planos/EJ-ELE-DRW-0024_02_files/12/3_4.webp", "tesela"],
  ]);
  const requests: Request[] = [];

  beforeAll(() => {
    process.env.DRAWINGS_S3_ENDPOINT = "https://cuenta.r2.example";
    process.env.DRAWINGS_S3_BUCKET = "planos";
    process.env.DRAWINGS_S3_ACCESS_KEY_ID = "id";
    process.env.DRAWINGS_S3_SECRET_ACCESS_KEY = "secreto";
    vi.stubGlobal("fetch", async (input: Request) => {
      requests.push(input);
      const body = objects.get(new URL(input.url).pathname.slice(1));
      return body === undefined ? new Response("", { status: 404 }) : new Response(body);
    });
  });

  afterAll(() => {
    for (const name of ["ENDPOINT", "BUCKET", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY"]) {
      delete process.env[`DRAWINGS_S3_${name}`];
    }
    vi.unstubAllGlobals();
  });

  it("reads descriptors and tiles from the bucket with signed requests", async () => {
    const tile = await readDrawingFile(["EJ-ELE-DRW-0024_02_files", "12", "3_4.webp"]);

    expect(tile?.body.toString()).toBe("tesela");
    expect(tile?.contentType).toBe("image/webp");
    expect(requests.at(-1)!.headers.get("Authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
    await expect(readDrawingFile(["EJ-ELE-DRW-0024_03.dzi"])).resolves.toBeNull();
  });

  it("knows the drawn sheets from the manifest, asking for it once a minute", async () => {
    requests.length = 0;

    await expect(hasDrawingImage("EJ-ELE-DRW-0024_02")).resolves.toBe(true);
    await expect(hasDrawingImage("EJ-ELE-DRW-0024_03")).resolves.toBe(false);

    expect(requests.filter((request) => request.url.endsWith("manifest.json"))).toHaveLength(1);
  });
});
