import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // The load tests hit a real Postgres (the test database): migrate it first and run the
    // files one after the other.
    globalSetup: ["@cables/db/testing/global-setup"],
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? "",
    },
    // Reading PDFs is slower than the rest of the unit tests.
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // The CLIs only read and write files; the test helpers build the PDFs.
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/cli/**", "src/testing/**"],
      reporter: ["text-summary", "html"],
      // Mínimo de CONTRIBUTING.md: si baja de aquí, `pnpm test` (y el CI) fallan.
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
});
