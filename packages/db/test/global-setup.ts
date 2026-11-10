import { execFileSync } from "node:child_process";
import path from "node:path";

const packageDir = path.resolve(import.meta.dirname, "..");
const prismaCli = path.join(packageDir, "node_modules", "prisma", "build", "index.js");

/**
 * Applies every pending migration to the test database before the suite runs.
 *
 * `DATABASE_URL_TEST` points at a separate database (created by the Docker init
 * script) so integration tests never touch development data.
 */
export default function globalSetup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error("DATABASE_URL_TEST no está definida. Revisa el .env de la raíz.");
  }

  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: packageDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}
