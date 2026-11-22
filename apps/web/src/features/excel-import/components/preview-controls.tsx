"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  applyExcelBatchAction,
  discardExcelAction,
  setExcelRowsAction,
} from "@/features/excel-import/actions";

const number = new Intl.NumberFormat("es-ES");

/** Marks or unmarks one row: the change is saved at once and the counts follow. */
export function RowCheckbox({
  importId,
  rowId,
  code,
  selected,
  disabled,
}: {
  importId: string;
  rowId: string;
  code: string;
  selected: boolean;
  disabled: boolean;
}) {
  const [checked, setChecked] = useOptimistic(selected);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <input
        type="checkbox"
        aria-label={`Aplicar ${code}`}
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.checked;
          startTransition(async () => {
            setChecked(next);
            const result = await setExcelRowsAction({ importId, rowIds: [rowId], selected: next });
            setError(result.ok ? null : result.message);
          });
        }}
        className="accent-primary size-4 shrink-0"
      />
      {error ? (
        <span role="alert" className="text-destructive text-xs">
          {error}
        </span>
      ) : null}
    </>
  );
}

/** «Marcar todas» / «Desmarcar todas» for the rows of the tab shown. */
export function SelectTabButtons({
  importId,
  kind,
}: {
  importId: string;
  kind: "CHANGE" | "NEW" | "DISCREPANCY";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function select(selected: boolean) {
    startTransition(async () => {
      const result = await setExcelRowsAction({ importId, kind, selected });
      setError(result.ok ? null : result.message);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => select(true)}
      >
        Marcar todas
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => select(false)}
      >
        Desmarcar todas
      </Button>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * «Aplicar» runs the batches one after the other, showing how far it got; if one fails, the
 * button continues where it stopped. «Descartar» keeps the preview saved as discarded.
 */
export function PreviewActions({
  importId,
  excelDay,
  pending,
  applying,
}: {
  importId: string;
  excelDay: string;
  /** Marked rows not applied yet. */
  pending: number;
  applying: boolean;
}) {
  const router = useRouter();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [discarding, startDiscard] = useTransition();

  async function apply() {
    const label = pending === 1 ? "1 cable" : `${number.format(pending)} cables`;
    if (!applying && !window.confirm(`¿Aplicar ${label} del Excel del ${excelDay}?`)) return;
    setError(null);
    setProgress({ done: 0, total: pending });
    for (;;) {
      const result = await applyExcelBatchAction(importId);
      if (!result.ok) {
        setError(result.message);
        break;
      }
      setProgress({ done: pending - result.remaining, total: pending });
      if (result.done) break;
    }
    setProgress(null);
    router.refresh();
  }

  function discard() {
    if (!window.confirm(`¿Descartar la vista previa del Excel del ${excelDay}?`)) return;
    startDiscard(async () => {
      const result = await discardExcelAction(importId);
      if (!result.ok) setError(result.message);
      else router.push("/import");
    });
  }

  return (
    <div className="bg-card flex flex-wrap items-center gap-3 rounded-lg border p-3">
      {progress ? null : (
        <>
          <Button type="button" onClick={apply} disabled={discarding || pending === 0}>
            {applying ? "Seguir aplicando" : "Aplicar"}
            <span className="tabular-nums">({number.format(pending)})</span>
          </Button>
          {applying ? null : (
            <Button type="button" variant="outline" onClick={discard} disabled={discarding}>
              Descartar
            </Button>
          )}
        </>
      )}
      {progress ? (
        <div role="status" className="flex min-w-48 flex-1 items-center gap-3 text-sm">
          {/* Mientras se aplica no hay botones: solo lo que se está haciendo y cuánto falta. */}
          <span className="font-medium">Aplicando…</span>
          <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full transition-[width]"
              style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
            />
          </div>
          <span className="text-muted-foreground tabular-nums">
            {number.format(progress.done)} de {number.format(progress.total)}
          </span>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive w-full text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
