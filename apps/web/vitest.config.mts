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

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["src/**/node_modules/**", "e2e/**", ".next/**"],
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
  },
});
