import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

// Playwright transpila este archivo a CommonJS, así que usamos `__dirname`.
const repoRoot = path.resolve(__dirname, "../..");
loadEnvConfig(repoRoot);

const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Se invoca el wrapper directamente: `pnpm run dev -- --port` reenvía el `--`
    // literal y Next.js lo interpreta como directorio de proyecto.
    command: `node scripts/next.mjs dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    cwd: __dirname,
  },
});
