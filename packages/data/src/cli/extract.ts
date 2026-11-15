/**
 * `pnpm data:extract`: reads every PDF in `private-data/source/` and writes the normalized
 * project data and a report to `private-data/extracted/`. Both folders are ignored by git:
 * the data is the client's and never leaves this machine.
 *
 * Options: --source <folder> --out <folder>
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { extractProjectData } from "../extract/extract";
import { formatReport } from "../extract/report";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

async function main() {
  const { values } = parseArgs({
    options: {
      source: { type: "string", default: path.join(repoRoot, "private-data", "source") },
      out: { type: "string", default: path.join(repoRoot, "private-data", "extracted") },
    },
  });
  const source = path.resolve(values.source);
  const out = path.resolve(values.out);

  const names = (await readdir(source))
    .filter((name) => name.toLowerCase().endsWith(".pdf"))
    .sort();
  if (names.length === 0) {
    throw new Error(`No hay PDFs en ${source}. Copia ahí los listados de cables y los planos.`);
  }
  console.warn(`Extracción: ${names.length} PDF en ${source}`);

  const started = Date.now();
  // One file in memory at a time: the drawings are huge.
  const files = names.map((name) => ({
    name,
    data: async () => new Uint8Array(await readFile(path.join(source, name))),
  }));
  const result = await extractProjectData(files, (message) => console.warn(`  ${message}`));

  await mkdir(out, { recursive: true });
  const write = (name: string, value: unknown) =>
    writeFile(path.join(out, name), `${JSON.stringify(value, null, 1)}\n`, "utf8");
  await Promise.all([
    write("cables.json", result.cables),
    write("trays.json", result.trays),
    write("sheets.json", result.sheets),
    write("report.json", { stats: result.stats, issues: result.issues }),
    writeFile(path.join(out, "report.md"), formatReport(result), "utf8"),
  ]);

  const errors = result.issues.filter((issue) => issue.severity === "error").length;
  console.warn(
    `Extracción terminada en ${Math.round((Date.now() - started) / 1000)} s: ` +
      `${result.cables.length} cables, ${result.trays.length} bandejas, ` +
      `${errors} errores y ${result.issues.length - errors} avisos. Informe: ${path.join(out, "report.md")}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
