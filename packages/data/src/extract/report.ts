import type { ExtractionResult } from "./schema";

const LIMIT_PER_GROUP = 200;

/** Text for a Markdown table cell: backslashes first, then the pipes that would split the cell. */
function cell(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

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
      (file) =>
        `| ${cell(file.name)} | ${file.pages} | ${file.cableSheets} | ${file.drawingSheets} |`,
    ),
    "",
    "## Resultado",
    "",
    `- Cables: ${result.cables.length} (${Object.entries(stats.cablesByLevel)
      .sort()
      .map(([level, count]) => `${level}: ${count}`)
      .join(", ")}).`,
    `- Bandejas: ${result.trays.length} (${stats.traysInDrawings} en los planos, ${stats.traysOnlyInRoutes} solo en los recorridos).`,
    `- Bandejas localizadas en el plano: ${stats.trayMarks.label} por su código dibujado, ${stats.trayMarks.flag} por la bandera de su sección; ${stats.trayMarks.tableOnly} solo en una tabla.`,
    `- Hojas de plano: ${result.sheets.length}.`,
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
        `| ${cell(issue.file)} | ${issue.page ?? ""} | ${cell(issue.code ?? "")} | ${cell(issue.message)} |`,
      );
    }
    if (group.length > LIMIT_PER_GROUP) {
      lines.push("", `… y ${group.length - LIMIT_PER_GROUP} más (ver \`report.json\`).`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
