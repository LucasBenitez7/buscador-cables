import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Reading PDFs is slower than the rest of the unit tests.
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // The CLI only reads and writes files; the test helpers build the PDFs.
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/cli/**", "src/testing/**"],
      reporter: ["text-summary", "html"],
      // Mínimo de CONTRIBUTING.md: si baja de aquí, `pnpm test` (y el CI) fallan.
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
