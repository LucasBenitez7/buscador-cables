import { execFileSync } from "node:child_process";
import path from "node:path";

const webDir = path.resolve(__dirname, "../..");
const tsxCli = path.resolve(webDir, "../../packages/db/node_modules/tsx/dist/cli.mjs");

/** Runs `e2e/scripts/db.mts` (ES module, with Prisma) from Playwright's CommonJS world. */
export function runDbScript(command: "prepare" | "reset-rate-limits") {
  execFileSync(process.execPath, [tsxCli, "e2e/scripts/db.mts", command], {
    cwd: webDir,
    env: process.env,
    stdio: "inherit",
  });
}

/**
 * Vacía los contadores del límite de intentos de login: los E2E entran y salen muchas veces
 * desde la misma IP y, si no, recibirían un 429 como lo recibiría un atacante.
 */
export function resetRateLimits() {
  runDbScript("reset-rate-limits");
}
