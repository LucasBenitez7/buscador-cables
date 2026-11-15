import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DrawingsBucket } from "@cables/shared";
import { uploadDrawings } from "./upload";

const bucket: DrawingsBucket = {
  endpoint: "https://cuenta.r2.example",
  bucket: "planos",
  accessKeyId: "id",
  secretAccessKey: "secreto",
};

/** A bucket in memory that answers the few S3 calls the upload makes. */
function fakeBucket() {
  const objects = new Map<string, { body: string; type: string | null }>();
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (request: Request) => {
    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.replace(/^\/planos\/?/, ""));
    calls.push(`${request.method} ${key}`);
    expect(request.headers.get("Authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
    if (request.method === "PUT") {
      objects.set(key, { body: await request.text(), type: request.headers.get("Content-Type") });
      return new Response("");
    }
    if (request.method === "DELETE") {
      objects.delete(key);
      return new Response(null, { status: 204 });
    }
    if (url.searchParams.get("list-type") === "2") {
      const prefix = url.searchParams.get("prefix") ?? "";
      const keys = [...objects.keys()].filter((name) => name.startsWith(prefix));
      return new Response(
        `<ListBucketResult><IsTruncated>false</IsTruncated>${keys.map((name) => `<Contents><Key>${name}</Key></Contents>`).join("")}</ListBucketResult>`,
      );
    }
    const object = objects.get(key);
    return object ? new Response(object.body) : new Response("", { status: 404 });
  });
  return { objects, calls };
}

let dir: string;

async function drawSheet(key: string, fingerprint: string, manifest: Record<string, unknown>) {
  await writeFile(path.join(dir, `${key}.dzi`), `<Image ${fingerprint}/>`);
  await mkdir(path.join(dir, `${key}_files`, "0"), { recursive: true });
  await writeFile(path.join(dir, `${key}_files`, "0", "0_0.webp"), `tesela ${fingerprint}`);
  manifest[key] = { fingerprint, width: 10, height: 10 };
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest));
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "upload-"));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

describe("uploadDrawings", () => {
  it("uploads the tiles of every sheet and then the manifest", async () => {
    const { objects, calls } = fakeBucket();
    await drawSheet("EJ-ELE-DRW-0024_02", "a", {});

    const summary = await uploadDrawings({ dir, bucket });

    expect(summary).toEqual({ uploaded: 1, unchanged: 0, removed: 0, files: 2 });
    expect(objects.get("EJ-ELE-DRW-0024_02_files/0/0_0.webp")).toEqual({
      body: "tesela a",
      type: "image/webp",
    });
    expect(objects.get("EJ-ELE-DRW-0024_02.dzi")?.type).toBe("application/xml");
    // El manifiesto, después de las teselas: la app nunca ofrece una hoja a medio subir.
    expect(calls.filter((call) => call.startsWith("PUT")).at(-1)).toBe("PUT manifest.json");
  });

  it("only uploads what changed and removes the sheets that are gone", async () => {
    const { objects } = fakeBucket();
    const manifest: Record<string, unknown> = {};
    await drawSheet("EJ-ELE-DRW-0024_02", "a", manifest);
    await drawSheet("EJ-ELE-DRW-0024_03", "b", manifest);
    await uploadDrawings({ dir, bucket });

    delete manifest["EJ-ELE-DRW-0024_03"];
    await drawSheet("EJ-ELE-DRW-0024_02", "c", manifest);
    await drawSheet("EJ-ELE-DRW-0024_04", "d", manifest);
    const summary = await uploadDrawings({ dir, bucket });

    expect(summary).toMatchObject({ uploaded: 2, unchanged: 0, removed: 1 });
    expect([...objects.keys()].some((key) => key.startsWith("EJ-ELE-DRW-0024_03"))).toBe(false);
    expect(objects.get("EJ-ELE-DRW-0024_02_files/0/0_0.webp")?.body).toBe("tesela c");

    const again = await uploadDrawings({ dir, bucket });
    expect(again).toMatchObject({ uploaded: 0, unchanged: 2, removed: 0 });
  });

  it("asks to render first when there is nothing drawn", async () => {
    fakeBucket();

    await expect(uploadDrawings({ dir, bucket })).rejects.toThrow(/pnpm data:render/);
  });
});
