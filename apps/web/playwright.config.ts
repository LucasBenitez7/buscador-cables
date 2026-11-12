import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

// Playwright transpila este archivo a CommonJS, así que usamos `__dirname`.
const repoRoot = path.resolve(__dirname, "../..");
loadEnvConfig(repoRoot);

/**
 * Los E2E usan su propia base de datos (`cables_e2e`), nunca la de desarrollo ni la de los
 * tests de integración: la preparación global la vacía y carga datos conocidos.
 */
function e2eDatabaseUrl(): string {
  if (process.env.E2E_DATABASE_URL) {
    return process.env.E2E_DATABASE_URL;
  }
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error("DATABASE_URL no está definida. Revisa el .env de la raíz.");
  }
  const url = new URL(base);
  url.pathname = "/cables_e2e";
  return url.toString();
}

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DATABASE_URL = e2eDatabaseUrl();

// Los workers heredan estas variables: los helpers de `e2e/support` usan la misma base.
process.env.E2E_DATABASE_URL = DATABASE_URL;
process.env.E2E_BASE_URL = BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Todos los tests comparten la base de E2E: uno detrás de otro, sin carreras.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      testIgnore: /mobile\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    {
      name: "mobile",
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // Compilación de producción y `next start`: no choca con un `pnpm dev` abierto (Next no
    // permite dos `next dev` en la misma carpeta) y prueba lo que se despliega.
    command: `node scripts/next.mjs build && node scripts/next.mjs start --port ${PORT}`,
    // Playwright arranca el servidor antes de `globalSetup`, que es quien crea la base: se
    // espera a una página que no la necesita.
    url: `${BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 300_000,
    cwd: __dirname,
    env: {
      DATABASE_URL,
      APP_URL: BASE_URL,
      BETTER_AUTH_URL: BASE_URL,
    },
  },
});
