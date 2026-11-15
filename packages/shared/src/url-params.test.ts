import { describe, expect, it } from "vitest";
import { pageSizeSchema, repage } from "./url-params";

describe("pageSizeSchema", () => {
  const schema = pageSizeSchema([25, 50, 100]);

  it("accepts only the sizes on offer", () => {
    expect(schema.parse("50")).toBe(50);
    expect(schema.parse("100")).toBe(100);
  });

  it("ignores any other value instead of failing", () => {
    for (const value of ["10000", "30", "0", "-25", "abc", "50.5", undefined]) {
      expect(schema.parse(value)).toBeUndefined();
    }
  });
});

describe("repage", () => {
  it("keeps the first item on screen in view when the page size changes", () => {
    // Página 3 de 25 empieza en el elemento 51: con 50 por página está en la 2.
    expect(repage(3, 25, 50)).toBe(2);
    // Página 2 de 100 empieza en el 101: con 25 por página, la 5.
    expect(repage(2, 100, 25)).toBe(5);
    // Página 179 de 25 (elemento 4451): con 100 por página, la 45.
    expect(repage(179, 25, 100)).toBe(45);
  });

  it("stays on page 1 from page 1 and keeps the page when the size does not change", () => {
    expect(repage(1, 25, 100)).toBe(1);
    expect(repage(7, 50, 50)).toBe(7);
  });
});
