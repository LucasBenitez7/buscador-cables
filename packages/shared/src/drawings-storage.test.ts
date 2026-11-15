import { describe, expect, it } from "vitest";
import { bucketObjectUrl, drawingsBucket } from "./drawings-storage";

const full = {
  DRAWINGS_S3_ENDPOINT: "https://cuenta.r2.cloudflarestorage.com/",
  DRAWINGS_S3_BUCKET: "planos",
  DRAWINGS_S3_ACCESS_KEY_ID: "id",
  DRAWINGS_S3_SECRET_ACCESS_KEY: "secreto",
};

describe("drawingsBucket", () => {
  it("uses the local folder when no variable is set", () => {
    expect(drawingsBucket({})).toBeNull();
    expect(drawingsBucket({ DRAWINGS_S3_BUCKET: " " })).toBeNull();
  });

  it("reads the bucket when every variable is set", () => {
    expect(drawingsBucket(full)).toEqual({
      endpoint: "https://cuenta.r2.cloudflarestorage.com",
      bucket: "planos",
      accessKeyId: "id",
      secretAccessKey: "secreto",
    });
  });

  it("refuses a bucket half configured instead of hiding the drawings", () => {
    expect(() => drawingsBucket({ ...full, DRAWINGS_S3_SECRET_ACCESS_KEY: "" })).toThrow(
      /DRAWINGS_S3_SECRET_ACCESS_KEY/,
    );
  });
});

describe("bucketObjectUrl", () => {
  it("builds a path-style URL with every segment encoded", () => {
    const bucket = drawingsBucket(full)!;

    expect(bucketObjectUrl(bucket, "EJ-ELE-DRW-0024_02_files/12/3_4.webp")).toBe(
      "https://cuenta.r2.cloudflarestorage.com/planos/EJ-ELE-DRW-0024_02_files/12/3_4.webp",
    );
  });
});
