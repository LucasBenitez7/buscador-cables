import { describe, expect, it } from "vitest";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { alignPage, drawingOfFile, likeness, placeScan } from "./render-red-marks";

// Un «plano» inventado: líneas pseudoaleatorias sobre blanco, apaisado como las hojas.
function drawing(width: number, height: number, seed: number): Canvas {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#000000";
  context.lineWidth = Math.max(1, width / 300);
  context.strokeRect(width * 0.02, height * 0.02, width * 0.96, height * 0.96);
  let state = seed;
  const random = () => (state = (state * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 60; i += 1) {
    context.beginPath();
    const x = random() * width;
    const y = random() * height;
    context.moveTo(x, y);
    context.lineTo(random() < 0.5 ? x : random() * width, random() < 0.5 ? y : random() * height);
    context.stroke();
  }
  return canvas;
}

/** The scan of a sheet: printed upright (a quarter turn) and a little smaller. */
function scanOf(sheet: Canvas): Canvas {
  const scan = createCanvas(sheet.height, sheet.width);
  const context = scan.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, scan.width, scan.height);
  context.translate(scan.width / 2, scan.height / 2);
  context.rotate(Math.PI / 2);
  context.scale(0.975, 0.975);
  context.drawImage(sheet, -sheet.width / 2, -sheet.height / 2);
  return scan;
}

describe("alignPage", () => {
  it("turns, scales and moves a scanned page onto its sheet", () => {
    const sheet = drawing(1000, 707, 7);
    const scan = scanOf(sheet);

    const found = alignPage({ small: drawing(260, 184, 7), fine: drawing(500, 354, 7) }, scan);

    expect(found.placement.rotation).toBe(-90);
    expect(found.placement.scale).toBeCloseTo(1 / 0.975, 1);
    expect(found.fit).toBeGreaterThan(0.9);
  });

  it("looks clearly less alike another sheet, even one with all its lines and more", () => {
    const scan = scanOf(drawing(1000, 707, 7));
    const found = alignPage({ small: drawing(260, 184, 7), fine: drawing(500, 354, 7) }, scan);
    const own = likeness(drawing(500, 354, 7), scan, found.placement);
    // Otra hoja con todas sus líneas y más (la misma planta a otra cota, con más bandejas).
    const busier = drawing(500, 354, 7);
    const context = busier.getContext("2d");
    context.lineWidth = 2;
    for (let i = 0; i < 40; i += 1) {
      context.beginPath();
      context.moveTo(20 + i * 11, 30);
      context.lineTo(20 + i * 11, 320);
      context.stroke();
    }

    expect(own).toBeGreaterThan(0.8);
    expect(likeness(busier, scan, found.placement)).toBeLessThan(own - 0.1);
    expect(likeness(drawing(500, 354, 11), scan, found.placement)).toBeLessThan(own - 0.3);
  });

  it("draws the scan at the size of the sheet", () => {
    const placed = placeScan(createCanvas(70, 100), 400, 283, {
      rotation: -90,
      scale: 1,
      dx: 0,
      dy: 0,
    });

    expect([placed.width, placed.height]).toEqual([400, 283]);
  });
});

describe("drawingOfFile", () => {
  it("is the drawing number the name starts with", () => {
    expect(drawingOfFile("EJ-ICO-DRW-0001 red marks.pdf")).toBe("EJ-ICO-DRW-0001");
    expect(drawingOfFile("planos/ej-ico-drw-0002_rm.pdf")).toBe("EJ-ICO-DRW-0002");
    expect(drawingOfFile("red marks.pdf")).toBeNull();
  });
});
