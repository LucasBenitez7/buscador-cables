"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { EXCEL_KIND_LABELS, excelPreviewParts } from "@cables/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addExcelPartAction,
  cancelExcelUploadAction,
  finishExcelUploadAction,
  startExcelUploadAction,
} from "@/features/excel-import/actions";
import { readExcelFile, type ReadExcelResult } from "@/features/excel-import/read-excel";

type Read = Extract<ReadExcelResult, { ok: true }> & { fileName: string };

const number = new Intl.NumberFormat("es-ES");

/**
 * Picks the Excel, reads it in the browser and sends what it says in parts: nothing is
 * applied here, the next screen is the preview. «Quitar archivo» empties the form and
 * «Cancelar» stops a preview being prepared: what the server already has is discarded.
 */
export function UploadExcelForm() {
  const router = useRouter();
  const ids = useId();
  const [read, setRead] = useState<Read | null>(null);
  const [excelDate, setExcelDate] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A new file or «Cancelar» starts another round: what the old one was doing is dropped.
  const round = useRef(0);
  const [fileKey, setFileKey] = useState(0);
  const busy = status !== null;

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const mine = ++round.current;
    setRead(null);
    setError(null);
    if (!file) return;
    setStatus("Leyendo el Excel…");
    const result = await readExcelFile(file);
    if (round.current !== mine) return;
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
    const mine = ++round.current;
    const cancelled = () => round.current !== mine;
    setError(null);
    const parts = excelPreviewParts(read.rows, read.ignored);
    setStatus("Preparando la vista previa…");
    const started = await startExcelUploadAction({
      kind: read.kind,
      excelDate,
      fileName: read.fileName,
      // La carga del proyecto ya se hizo (fase 17): todo lo que se sube es del día.
      projectLoad: false,
      rowCount: read.rows.length,
    });
    if (cancelled()) {
      if (started.ok) void cancelExcelUploadAction(started.importId);
      return;
    }
    if (!started.ok) return stop(started.message);
    for (const [index, part] of parts.entries()) {
      if (parts.length > 1) {
        setStatus(`Preparando la vista previa… ${index + 1} de ${parts.length}`);
      }
      const sent = await addExcelPartAction({ importId: started.importId, ...part });
      if (cancelled()) return void cancelExcelUploadAction(started.importId);
      if (!sent.ok) return stop(sent.message);
    }
    const finished = await finishExcelUploadAction(started.importId);
    if (cancelled()) return void cancelExcelUploadAction(started.importId);
    if (!finished.ok) return stop(finished.message);
    router.push(`/import/${finished.importId}`);
  }

  /** Back to an empty form; a preview being prepared is cancelled where it is. */
  function reset() {
    round.current += 1;
    setRead(null);
    setExcelDate("");
    setStatus(null);
    setError(null);
    setFileKey((key) => key + 1);
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
          key={fileKey}
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
          </div>
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {/* Mientras lee o prepara, en vez del botón, lo que está haciendo (y «Cancelar»). */}
        {status ? (
          <p role="status" className="text-sm font-medium">
            {status}
          </p>
        ) : (
          <Button type="submit" disabled={!read || !excelDate}>
            Preparar vista previa
          </Button>
        )}
        {busy || read ? (
          <Button type="button" variant="secondary" onClick={reset}>
            {busy ? "Cancelar" : "Quitar archivo"}
          </Button>
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
