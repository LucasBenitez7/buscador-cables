import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts"],
      reporter: ["text-summary", "html"],
      // Mínimo de CONTRIBUTING.md: si baja de aquí, `pnpm test` (y el CI) fallan.
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
