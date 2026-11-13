/**
 * `pnpm data:load`: loads `private-data/extracted/cables.json` and `trays.json` (written by
 * `pnpm data:extract`) into the database of `DATABASE_URL`. Run it locally or in the client's
 * environment, never in CI: the data is the client's.
 *
 * Options: --from <folder> --as <email of the user who signs the events>
 * (by default, SEED_ADMIN_EMAIL from .env).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createPrismaClient } from "@cables/db";
import { loadProjectData } from "../load/load";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

async function main() {
  const { values } = parseArgs({
    options: {
      from: { type: "string", default: path.join(repoRoot, "private-data", "extracted") },
      as: { type: "string", default: process.env.SEED_ADMIN_EMAIL ?? "" },
    },
  });
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está definida. Revisa el .env de la raíz.");
  const email = values.as.trim().toLowerCase();
  if (!email) {
    throw new Error("Indica quién firma la carga con --as <email> (o SEED_ADMIN_EMAIL en .env).");
  }

  const folder = path.resolve(values.from);
  const read = async (name: string) =>
    JSON.parse(await readFile(path.join(folder, name), "utf8")) as unknown;
  const [cables, trays] = await Promise.all([read("cables.json"), read("trays.json")]);

  const db = createPrismaClient(url);
  try {
    const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true } });
    if (!user) throw new Error(`No existe ningún usuario con el correo ${email}.`);
    console.warn(`Carga: ${folder} → base de datos, firmada por ${user.name}`);

    const started = Date.now();
    const summary = await loadProjectData(
      db,
      { cables, trays },
      {
        userId: user.id,
        onProgress: (message) => console.warn(`  ${message}`),
      },
    );

    const { cables: c, trays: t } = summary;
    console.warn(
      `Carga terminada en ${Math.round((Date.now() - started) / 1000)} s.\n` +
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
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
