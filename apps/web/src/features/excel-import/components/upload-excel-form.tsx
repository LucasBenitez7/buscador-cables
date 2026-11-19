"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type ChangeEvent, type FormEvent } from "react";
import { EXCEL_KIND_LABELS, excelPreviewParts, type ExcelKind } from "@cables/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addExcelPartAction,
  finishExcelUploadAction,
  startExcelUploadAction,
} from "@/features/excel-import/actions";
import { readExcelFile, type ReadExcelResult } from "@/features/excel-import/read-excel";

type Props = {
  /** The load of the project, for an administrator while no Excel of the day was applied. */
  projectLoadKinds: readonly ExcelKind[];
};

type Read = Extract<ReadExcelResult, { ok: true }> & { fileName: string };

const number = new Intl.NumberFormat("es-ES");

/**
 * Picks the Excel, reads it in the browser and sends what it says in parts: nothing is
 * applied here, the next screen is the preview.
 */
export function UploadExcelForm({ projectLoadKinds }: Props) {
  const router = useRouter();
  const ids = useId();
  const [read, setRead] = useState<Read | null>(null);
  const [excelDate, setExcelDate] = useState("");
  const [projectLoad, setProjectLoad] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = status !== null;

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setRead(null);
    setError(null);
    setProjectLoad(false);
    if (!file) return;
    setStatus("Leyendo el Excel…");
    const result = await readExcelFile(file);
    setStatus(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setRead({ ...result, fileName: file.name });
    setExcelDate(result.excelDate ?? "");
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!read) return;
    setError(null);
    const parts = excelPreviewParts(read.rows, read.ignored);
    setStatus("Preparando la vista previa…");
    const started = await startExcelUploadAction({
      kind: read.kind,
      excelDate,
      fileName: read.fileName,
      projectLoad,
      rowCount: read.rows.length,
    });
    if (!started.ok) return stop(started.message);
    for (const [index, part] of parts.entries()) {
      if (parts.length > 1) {
        setStatus(`Preparando la vista previa… ${index + 1} de ${parts.length}`);
      }
      const sent = await addExcelPartAction({ importId: started.importId, ...part });
      if (!sent.ok) return stop(sent.message);
    }
    const finished = await finishExcelUploadAction(started.importId);
    if (!finished.ok) return stop(finished.message);
    router.push(`/import/${finished.importId}`);
  }

  function stop(message: string) {
    setStatus(null);
    setError(message);
  }

  return (
    <form onSubmit={onSubmit} className="bg-card space-y-4 rounded-lg border p-4">
      <h2 className="text-base font-semibold">Subir Excel del día</h2>

      <div className="max-w-xl space-y-1.5">
        <label htmlFor={`${ids}-file`} className="text-sm font-medium">
          Archivo
        </label>
        <Input
          id={`${ids}-file`}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={onFile}
          disabled={busy}
        />
      </div>

      {read ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="info">{EXCEL_KIND_LABELS[read.kind]}</Badge>
            <span className="tabular-nums">{number.format(read.rows.length)} cables</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-end">
            <div className="space-y-1.5">
              <label htmlFor={`${ids}-date`} className="text-sm font-medium">
                Fecha del Excel
              </label>
              <Input
                id={`${ids}-date`}
                type="date"
                required
                value={excelDate}
                onChange={(event) => setExcelDate(event.target.value)}
                disabled={busy}
              />
            </div>
            {projectLoadKinds.includes(read.kind) ? (
              <label className="flex items-center gap-2 text-sm sm:pb-1.5">
                <input
                  type="checkbox"
                  checked={projectLoad}
                  onChange={(event) => setProjectLoad(event.target.checked)}
                  disabled={busy}
                  className="accent-primary size-4 shrink-0"
                />
                Carga del proyecto
              </label>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!read || !excelDate || busy}>
          Preparar vista previa
        </Button>
        {status ? (
          <p role="status" className="text-muted-foreground text-sm">
            {status}
          </p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </form>
  );
}
