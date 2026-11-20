"use client";

import { cn } from "cn";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DISCREPANCY_DECISION_LABELS, type DiscrepancyDecision } from "@cables/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CODE_LINK } from "@/components/ui/text-link";
import {
  decideDiscrepanciesAction,
  markDiscrepanciesSeenAction,
} from "@/features/excel-import/actions";
import { DecisionButtons } from "@/features/excel-import/components/decision-buttons";
import type { DiscrepancyItem } from "@/server/excel-import/discrepancies";

const number = new Intl.NumberFormat("es-ES");

/** What was decided, said as done. */
const DECIDED_LABELS = {
  KEEP_WEB: "Se mantuvo lo de la web",
  ACCEPT_EXCEL: "Se aceptó lo del Excel",
} as const;

/** Opening the pending ones: the menu and the home page stop warning about them. */
export function MarkDiscrepanciesSeen() {
  useEffect(() => {
    void markDiscrepanciesSeenAction();
  }, []);
  return null;
}

/**
 * The discrepancies of a page. Pending ones can be ticked one by one or all of them (every
 * pending one, not only this page) and decided together; each keeps its own event.
 */
export function DiscrepancyList({
  items,
  pending,
  total,
  empty,
}: {
  items: DiscrepancyItem[];
  pending: boolean;
  /** Every pending one, on any page. */
  total: number;
  /** What to say when there is none. */
  empty: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const count = all ? total : picked.size;

  function toggle(id: string, checked: boolean) {
    setAll(false);
    setPicked((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setAll(checked);
    setPicked(checked ? new Set(items.map((item) => item.id)) : new Set());
  }

  async function decide(decision: DiscrepancyDecision) {
    const label = DISCREPANCY_DECISION_LABELS[decision];
    const many = count === 1 ? "1 discrepancia" : `${number.format(count)} discrepancias`;
    if (!window.confirm(`¿${label} en ${many}?`)) return;
    setBusy(true);
    setMessage(null);
    let decided = 0;
    const failed: { id: string; code: string; message: string }[] = [];
    for (;;) {
      const result = await decideDiscrepanciesAction(
        all
          ? { all: true, decision, skip: failed.map((failure) => failure.id) }
          : { ids: [...picked], decision },
      );
      if (!result.ok) {
        failed.push({ id: "", code: "", message: result.message });
        break;
      }
      decided += result.decided;
      failed.push(...result.failed);
      if (!all || result.remaining === 0 || result.decided === 0) break;
    }
    setBusy(false);
    setPicked(new Set());
    setAll(false);
    const done = decided === 1 ? "1 decidida" : `${number.format(decided)} decididas`;
    setMessage(
      failed.length === 0
        ? { ok: true, text: `${done}.` }
        : {
            ok: false,
            text: `${done}. ${failed
              .map((failure) =>
                failure.code ? `${failure.code}: ${failure.message}` : failure.message,
              )
              .join(" ")}`,
          },
    );
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {pending && items.length > 0 ? (
        <div className="bg-card flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={all}
              onChange={(event) => toggleAll(event.target.checked)}
              disabled={busy}
              className="accent-primary size-4 shrink-0"
            />
            Seleccionar todas ({number.format(total)})
          </label>
          {count > 0 ? (
            <div className="grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto">
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-10 whitespace-normal md:min-h-9"
                disabled={busy}
                onClick={() => decide("KEEP_WEB")}
              >
                {DISCREPANCY_DECISION_LABELS.KEEP_WEB} ({number.format(count)})
              </Button>
              <Button
                type="button"
                className="h-auto min-h-10 whitespace-normal md:min-h-9"
                disabled={busy}
                onClick={() => decide("ACCEPT_EXCEL")}
              >
                {DISCREPANCY_DECISION_LABELS.ACCEPT_EXCEL} ({number.format(count)})
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {message ? (
        <p
          role="status"
          className={message.ok ? "text-success text-sm" : "text-destructive text-sm"}
        >
          {message.text}
        </p>
      ) : null}
      {items.length === 0 ? <p className="text-muted-foreground text-sm">{empty}</p> : null}
      <ul className="space-y-2">
        {items.map((item) => (
          <DiscrepancyCard
            key={item.id}
            item={item}
            selectable={pending}
            checked={all || picked.has(item.id)}
            disabled={busy}
            onCheck={(checked) => toggle(item.id, checked)}
          />
        ))}
      </ul>
    </div>
  );
}

function DiscrepancyCard({
  item,
  selectable,
  checked,
  disabled,
  onCheck,
}: {
  item: DiscrepancyItem;
  selectable: boolean;
  checked: boolean;
  disabled: boolean;
  onCheck: (checked: boolean) => void;
}) {
  return (
    <li className="bg-card space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        {selectable ? (
          <input
            type="checkbox"
            aria-label={`Seleccionar ${item.cable.code}`}
            checked={checked}
            disabled={disabled}
            onChange={(event) => onCheck(event.target.checked)}
            className="accent-primary size-4 shrink-0"
          />
        ) : null}
        <Link href={`/cables/${item.cable.id}`} className={CODE_LINK}>
          {item.cable.code}
        </Link>
        {item.webBefore ? <Badge variant="warning">Cambiado en la web después</Badge> : null}
        {item.agreesOn ? (
          <Badge variant="info">El Excel del {item.agreesOn} ya coincide con la web</Badge>
        ) : null}
      </div>
      {/* Las dos versiones lado a lado; cada botón, bajo la suya. */}
      <div className="grid grid-cols-2 gap-2">
        <Side
          label="En la web"
          state={item.web}
          detail={
            item.webBefore
              ? `Antes: ${item.webBefore} (${item.webBy} · ${item.webAt})`
              : `${item.webBy} · ${item.webAt}`
          }
          tone={tone(item, "KEEP_WEB")}
          verdict={item.decision?.kind === "KEEP_WEB" ? DECIDED_LABELS.KEEP_WEB : null}
        />
        <Side
          label={`Excel del ${item.excelDay}`}
          state={item.excel}
          tone={tone(item, "ACCEPT_EXCEL")}
          verdict={item.decision?.kind === "ACCEPT_EXCEL" ? DECIDED_LABELS.ACCEPT_EXCEL : null}
        />
      </div>
      {item.decision ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Revisada por </span>
          {item.decision.by}
          <span className="text-muted-foreground"> · {item.decision.at}</span>
        </p>
      ) : (
        <DecisionButtons id={item.id} code={item.cable.code} />
      )}
    </li>
  );
}

type Tone = "pending" | "chosen" | "discarded";

/** Pending: both ask for attention. Decided: the chosen one stands out, the other fades. */
function tone(item: DiscrepancyItem, side: "KEEP_WEB" | "ACCEPT_EXCEL"): Tone {
  if (!item.decision) return "pending";
  return item.decision.kind === side ? "chosen" : "discarded";
}

function Side({
  label,
  state,
  detail,
  tone,
  verdict,
}: {
  label: string;
  state: string;
  detail?: string;
  tone: Tone;
  verdict: string | null;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-md border p-3",
        tone === "pending" && "bg-background",
        tone === "chosen" && "border-primary bg-primary/10",
        tone === "discarded" && "bg-muted/30 opacity-60",
      )}
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-base font-semibold break-words">{state}</span>
      {detail ? <span className="text-muted-foreground text-xs">{detail}</span> : null}
      {verdict ? (
        <span className="text-primary mt-auto pt-1 text-sm font-medium">✓ {verdict}</span>
      ) : null}
    </div>
  );
}
