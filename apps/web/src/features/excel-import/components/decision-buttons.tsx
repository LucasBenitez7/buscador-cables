"use client";

import { useState, useTransition } from "react";
import { DISCREPANCY_DECISION_LABELS, type DiscrepancyDecision } from "@cables/shared";
import { Button } from "@/components/ui/button";
import { decideDiscrepancyAction } from "@/features/excel-import/actions";

/** The two decisions on a discrepancy; the list refreshes when one is saved. */
export function DecisionButtons({ id, code }: { id: string; code: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(decision: DiscrepancyDecision) {
    startTransition(async () => {
      const result = await decideDiscrepancyAction({ id, decision });
      setError(result.ok ? null : result.message);
    });
  }

  return (
    // Dos columnas, como las dos versiones de encima: cada botón queda bajo la suya.
    <div className="grid grid-cols-2 gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-auto min-h-10 w-full whitespace-normal md:min-h-9"
        disabled={pending}
        aria-label={`${DISCREPANCY_DECISION_LABELS.KEEP_WEB}: ${code}`}
        onClick={() => decide("KEEP_WEB")}
      >
        {DISCREPANCY_DECISION_LABELS.KEEP_WEB}
      </Button>
      <Button
        type="button"
        className="h-auto min-h-10 w-full whitespace-normal md:min-h-9"
        disabled={pending}
        aria-label={`${DISCREPANCY_DECISION_LABELS.ACCEPT_EXCEL}: ${code}`}
        onClick={() => decide("ACCEPT_EXCEL")}
      >
        {DISCREPANCY_DECISION_LABELS.ACCEPT_EXCEL}
      </Button>
      {error ? (
        <p role="alert" className="text-destructive col-span-2 text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
