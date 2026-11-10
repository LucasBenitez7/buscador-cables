import { createRequire } from "node:module";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// `@next/env` is CommonJS, so it cannot be imported by name from an `.mts` config.
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env") as {
  loadEnvConfig: (dir: string, dev?: boolean) => void;
};

const repoRoot = path.resolve(import.meta.dirname, "../..");
loadEnvConfig(repoRoot);

const INTEGRATION_TESTS = "src/**/*.int.test.ts";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/components/ui/**",
        "src/app/layout.tsx",
        "src/lib/env.ts",
      ],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./vitest.setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/**/node_modules/**", "e2e/**", ".next/**", INTEGRATION_TESTS],
        },
      },
      {
        extends: true,
        test: {
          // Servicios de `server/` contra un Postgres real (base de datos de test).
          name: "integration",
          environment: "node",
          setupFiles: ["./vitest.integration.setup.ts"],
          include: [INTEGRATION_TESTS],
          globalSetup: ["@cables/db/testing/global-setup"],
          // Comparten base de datos: un archivo detrás de otro.
          fileParallelism: false,
          env: {
            DATABASE_URL: process.env.DATABASE_URL_TEST ?? "",
          },
        },
      },
    ],
  },
});
