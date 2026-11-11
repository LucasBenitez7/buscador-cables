import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Reglas del tema oscuro (docs/ARQUITECTURA.md → "Interfaz: tema oscuro").
const SRC = path.resolve(import.meta.dirname, "..");
const GLOBALS_CSS = readFileSync(path.join(SRC, "app", "globals.css"), "utf8");

// Los correos HTML quedan fuera: cada cliente de correo aplica sus propios colores.
const EXCLUDED = new Set([path.join(SRC, "lib", "email-templates.ts")]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    const isSource = /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name);
    return isSource && !EXCLUDED.has(fullPath) ? [fullPath] : [];
  });
}

const FILES = sourceFiles(SRC).map((file) => ({
  name: path.relative(SRC, file).split(path.sep).join("/"),
  content: readFileSync(file, "utf8"),
}));

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const UTILITY =
  "bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|divide|placeholder|caret|accent|shadow";
const FIXED_COLOR_CLASS = new RegExp(
  `\\b(?:${UTILITY})-(?:white|black|(?:${PALETTE})-\\d{2,3})\\b|-\\[#[0-9a-fA-F]{3,8}\\]`,
  "g",
);

function findAll(pattern: RegExp) {
  return FILES.flatMap(({ name, content }) =>
    [...content.matchAll(pattern)].map((match) => `${name}: ${match[0]}`),
  );
}

describe("dark theme", () => {
  it("uses theme tokens instead of fixed Tailwind colors", () => {
    expect(findAll(FIXED_COLOR_CLASS)).toEqual([]);
  });

  // Regresión: el badge usaba var(--signal) y var(--line), que no existían, y se pintaba sin fondo.
  it("only references CSS variables that are defined", () => {
    const defined = new Set([
      ...[...GLOBALS_CSS.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]),
      // Variables que crea next/font en el layout (`variable: "--font-…"`).
      ...FILES.flatMap(({ content }) =>
        [...content.matchAll(/variable:\s*"(--[a-z0-9-]+)"/g)].map((match) => match[1]),
      ),
    ]);
    const undefinedVariables = FILES.flatMap(({ name, content }) =>
      [...content.matchAll(/var\((--[a-z0-9-]+)\)/g)]
        .filter((match) => !defined.has(match[1]))
        .map((match) => `${name}: ${match[1]}`),
    );

    expect(undefinedVariables).toEqual([]);
  });

  it("defines a single dark palette with no white backgrounds", () => {
    const lightness = (token: string) => {
      const match = GLOBALS_CSS.match(new RegExp(`--${token}:\\s*oklch\\(([\\d.]+)`));
      return Number(match?.[1]);
    };

    expect(GLOBALS_CSS).toContain("color-scheme: dark");
    expect(GLOBALS_CSS).not.toMatch(/^\.dark\s*\{/m);
    for (const surface of ["background", "card", "popover", "muted", "secondary", "accent"]) {
      expect(lightness(surface), surface).toBeLessThan(0.35);
    }
    // Texto claro, pero no blanco puro.
    expect(lightness("foreground")).toBeGreaterThan(0.85);
    expect(lightness("foreground")).toBeLessThan(1);
  });

  it("renders every page with the dark class on <html>", () => {
    const layout = FILES.find(({ name }) => name === "app/layout.tsx")?.content ?? "";

    expect(layout).toMatch(/<html[^>]*className="dark"/);
  });
});
