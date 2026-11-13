import type { ExtractionResult } from "./schema";

const LIMIT_PER_GROUP = 200;

/** Human-readable summary of an extraction, in Spanish, for `report.md`. */
export function formatReport(result: ExtractionResult, generatedAt = new Date()): string {
  const { stats, issues } = result;
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const lines = [
    "# Informe de extracción",
    "",
    `Generado: ${generatedAt.toISOString()}`,
    "",
    "## Ficheros",
    "",
    "| Fichero | Páginas | Fichas de cable | Hojas de plano |",
    "| --- | ---: | ---: | ---: |",
    ...stats.files.map(
      (file) => `| ${file.name} | ${file.pages} | ${file.cableSheets} | ${file.drawingSheets} |`,
    ),
    "",
    "## Resultado",
    "",
    `- Cables: ${result.cables.length} (${Object.entries(stats.cablesByLevel)
      .sort()
      .map(([level, count]) => `${level}: ${count}`)
      .join(", ")}).`,
    `- Bandejas: ${result.trays.length} (${stats.traysInDrawings} en los planos, ${stats.traysOnlyInRoutes} solo en los recorridos).`,
    `- Tramos de recorrido: ${result.cables.reduce((sum, cable) => sum + cable.route.length, 0)}.`,
    `- Errores (fichas descartadas): ${errors.length}. Avisos: ${warnings.length}.`,
    "",
  ];
  for (const [title, group] of [
    ["Errores", errors],
    ["Avisos", warnings],
  ] as const) {
    if (group.length === 0) continue;
    lines.push(
      `## ${title}`,
      "",
      "| Fichero | Página | Código | Detalle |",
      "| --- | ---: | --- | --- |",
    );
    for (const issue of group.slice(0, LIMIT_PER_GROUP)) {
      lines.push(
        `| ${issue.file} | ${issue.page ?? ""} | ${issue.code ?? ""} | ${issue.message.replace(/\|/g, "\\|")} |`,
      );
    }
    if (group.length > LIMIT_PER_GROUP) {
      lines.push("", `… y ${group.length - LIMIT_PER_GROUP} más (ver \`report.json\`).`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
