/**
 * `pnpm data:load`: loads `private-data/extracted/cables.json` and `trays.json` (written by
 * `pnpm data:extract`) into the database of `DATABASE_URL`. Run it locally or in the client's
 * environment, never in CI: the data is the client's.
 *
 * Options:
 *   --from <folder>   where the extracted files are (default: private-data/extracted)
 *   --as <email>      who signs the events (default: SEED_ADMIN_EMAIL from .env)
 *   --dry-run         do everything in one transaction and roll it back: only the summary
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createPrismaClient } from "@cables/db";
import { hasPermission, isRole } from "@cables/shared";
import { loadProjectData } from "../load/load";
import { describeTarget, signerProblem } from "../load/target";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

async function main() {
  const { values } = parseArgs({
    options: {
      from: { type: "string", default: path.join(repoRoot, "private-data", "extracted") },
      as: { type: "string", default: process.env.SEED_ADMIN_EMAIL ?? "" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está definida. Revisa el .env de la raíz.");
  // Refuses the test databases and says where the data goes, without the password.
  const target = describeTarget(url);
  const email = values.as.trim().toLowerCase();
  if (!email) {
    throw new Error("Indica quién firma la carga con --as <email> (o SEED_ADMIN_EMAIL en .env).");
  }
  const dryRun = values["dry-run"];

  const folder = path.resolve(values.from);
  const read = async (name: string) =>
    JSON.parse(await readFile(path.join(folder, name), "utf8")) as unknown;
  const [cables, trays] = await Promise.all([read("cables.json"), read("trays.json")]);

  const db = createPrismaClient(url);
  try {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, name: true, role: true, active: true },
    });
    const problem = signerProblem(
      email,
      user && {
        active: user.active,
        canImport: isRole(user.role) && hasPermission(user.role, "import:run"),
      },
    );
    if (!user || problem) throw new Error(problem ?? "Usuario no válido.");
    console.warn(
      `Carga${dryRun ? " de prueba (no se guarda nada)" : ""}: ${folder} → ${target}, firmada por ${user.name}`,
    );

    const started = Date.now();
    const summary = await loadProjectData(
      db,
      { cables, trays },
      {
        userId: user.id,
        dryRun,
        onProgress: (message) => console.warn(`  ${message}`),
      },
    );

    const { cables: c, trays: t } = summary;
    console.warn(
      `Carga ${dryRun ? "de prueba " : ""}terminada en ${Math.round((Date.now() - started) / 1000)} s.\n` +
        `  Ubicaciones nuevas: ${summary.locations.created}. Tipos nuevos: ${summary.cableTypes.created}.\n` +
        `  Bandejas: ${t.created} nuevas, ${t.updated} actualizadas, ${t.unchanged} sin cambios.\n` +
        `  Cables: ${c.created} nuevos, ${c.updated} actualizados, ${c.unchanged} sin cambios, ${c.skipped} omitidos.`,
    );
    if (summary.missingFromLists.length > 0) {
      console.warn(
        `  ${summary.missingFromLists.length} cables cargados antes ya no están en los listados (no se tocan): ` +
          summary.missingFromLists.slice(0, 20).join(", ") +
          (summary.missingFromLists.length > 20 ? "…" : ""),
      );
    }
    for (const issue of summary.issues) console.warn(`  Aviso: ${issue}`);
    if (dryRun) console.warn("  Era una prueba: la base de datos no ha cambiado.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
