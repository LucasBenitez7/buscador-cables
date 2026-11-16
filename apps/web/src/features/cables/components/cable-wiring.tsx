"use client";

import { cn } from "cn";
import { PencilIcon, RotateCcwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import {
  WIRING_FIELDS,
  WIRING_FIELD_LABELS,
  WIRING_TEXT_MAX,
  describeDuplicate,
  findDuplicateTerminals,
  formatTerminal,
  isFieldEdited,
  normalizeTerminal,
  pdfValue,
  type WireRow,
  type WiringField,
} from "@cables/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { editWiringAction } from "@/features/cables/wiring-actions";
import type { CableJumperDetail } from "@/server/cables/detail";

type Props = {
  cableId: string;
  version: number;
  wires: WireRow[];
  jumpers: CableJumperDetail[];
  /** The user may correct terminals (permission `cable:wiring`, cable not deleted). */
  canEdit: boolean;
};

type Draft = Record<number, Record<WiringField, string>>;

const draftOf = (wires: readonly WireRow[]): Draft =>
  Object.fromEntries(
    wires.map((wire) => [
      wire.position,
      Object.fromEntries(WIRING_FIELDS.map((field) => [field, wire[field] ?? ""])),
    ]),
  ) as Draft;

const COLUMN_HEAD = "text-muted-foreground px-3 py-2 text-left text-xs font-medium";

/**
 * The wiring table of a cable: each wire and its terminal strip and terminal at each end.
 * Cells corrected in the field are marked, with what the list says. With the edit mode on,
 * the user corrects cells and saves them all at once; two wires in one terminal are pointed
 * out as they are typed and need a confirmation to be saved.
 */
export function CableWiring({ cableId, version, wires, jumpers, canEdit }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftOf(wires));
  const [notes, setNotes] = useState("");
  const [serverDuplicates, setServerDuplicates] = useState<string[]>([]);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const switchId = useId();
  const showColour = wires.some((wire) => wire.colour);

  // The rows as they would be saved, and which wires the user touched.
  const rows = useMemo(
    () =>
      wires.map((wire) => ({
        ...wire,
        ...(Object.fromEntries(
          WIRING_FIELDS.map((field) => [field, normalizeTerminal(draft[wire.position]?.[field])]),
        ) as Record<WiringField, string | null>),
      })),
    [draft, wires],
  );
  const changes = rows.flatMap((row, index) =>
    WIRING_FIELDS.filter((field) => row[field] !== wires[index]![field]).map(() => row.position),
  );
  const touched = new Set(changes);
  const changedCells = changes.length;

  const duplicates = editing ? findDuplicateTerminals(rows, touched) : [];
  const repeated = new Set(
    duplicates.flatMap((duplicate) =>
      rows
        .filter(
          (row) =>
            duplicate.wires.includes(row.wire) &&
            (row[`${duplicate.end}Point`] ?? "").toUpperCase() === duplicate.point.toUpperCase(),
        )
        .map((row) => `${row.position}.${duplicate.end}`),
    ),
  );

  function startEditing() {
    setDraft(draftOf(wires));
    setNotes("");
    setServerDuplicates([]);
    setResult(null);
    setEditing(true);
  }

  function stopEditing() {
    setEditing(false);
    setServerDuplicates([]);
  }

  function setCell(position: number, field: WiringField, value: string) {
    setServerDuplicates([]);
    setDraft((current) => ({ ...current, [position]: { ...current[position]!, [field]: value } }));
  }

  function restoreList(wire: WireRow) {
    setServerDuplicates([]);
    setDraft((current) => ({
      ...current,
      [wire.position]: Object.fromEntries(
        WIRING_FIELDS.map((field) => [field, pdfValue(wire, field) ?? ""]),
      ) as Record<WiringField, string>,
    }));
  }

  function save(confirmDuplicates: boolean) {
    startTransition(async () => {
      const response = await editWiringAction({
        cableId,
        version,
        confirmDuplicates,
        notes,
        wires: rows.map((row) => ({
          position: row.position,
          originBlock: row.originBlock,
          originPoint: row.originPoint,
          destinationBlock: row.destinationBlock,
          destinationPoint: row.destinationPoint,
        })),
      });
      if ("duplicates" in response) {
        setServerDuplicates(response.duplicates);
        setResult({ ok: false, message: response.message });
        return;
      }
      setResult(response);
      if (response.ok) {
        setEditing(false);
        router.refresh();
      }
    });
  }

  if (wires.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        El listado no trae la tabla de conexionado de este cable.
      </p>
    );
  }

  const editedInField = wires.filter((wire) =>
    WIRING_FIELDS.some((field) => isFieldEdited(wire, field)),
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {wires.length} {wires.length === 1 ? "hilo" : "hilos"}
          {editedInField > 0 ? (
            <>
              {" · "}
              <span className="text-warning font-medium">
                {editedInField} {editedInField === 1 ? "corregido" : "corregidos"} en campo
              </span>
            </>
          ) : null}
        </p>
        {canEdit ? (
          <div className="flex items-center gap-2">
            <Label htmlFor={switchId} className="text-sm">
              Modo editar
            </Label>
            <button
              id={switchId}
              type="button"
              role="switch"
              aria-checked={editing}
              disabled={pending}
              onClick={() => (editing ? stopEditing() : startEditing())}
              className={cn(
                "focus-visible:ring-ring/50 relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors outline-none focus-visible:ring-3 disabled:opacity-50",
                editing ? "bg-primary border-primary" : "bg-muted",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "bg-background size-4 rounded-full shadow transition-transform",
                  editing ? "translate-x-6" : "translate-x-1",
                )}
              />
            </button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <p className="border-warning/50 bg-warning/10 rounded-lg border px-3 py-2 text-sm">
          <PencilIcon aria-hidden className="text-warning mr-1.5 inline size-4" />
          Cambia solo lo que en campo no coincide con el listado. El listado se sigue guardando y la
          hoja original no cambia.
        </p>
      ) : null}

      <div className="bg-card overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="sr-only">Hilos del cable y sus bornas en origen y destino</caption>
          <thead className="border-b">
            <tr>
              <th scope="col" rowSpan={2} className={COLUMN_HEAD}>
                Hilo
              </th>
              {showColour ? (
                <th scope="col" rowSpan={2} className={COLUMN_HEAD}>
                  Color
                </th>
              ) : null}
              <th scope="colgroup" colSpan={2} className={cn(COLUMN_HEAD, "border-l pb-0")}>
                Origen
              </th>
              <th scope="colgroup" colSpan={2} className={cn(COLUMN_HEAD, "border-l pb-0")}>
                Destino
              </th>
              {editing ? (
                <th scope="col" rowSpan={2} className="sr-only">
                  Restaurar
                </th>
              ) : null}
            </tr>
            <tr>
              {WIRING_FIELDS.map((field) => (
                <th
                  key={field}
                  scope="col"
                  className={cn(COLUMN_HEAD, "pt-0.5", field.endsWith("Block") && "border-l")}
                >
                  {field.endsWith("Block") ? "Regletero" : "Borna"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => {
              const wire = wires.find((item) => item.position === row.position)!;
              return (
                <tr key={row.position} className={cn(touched.has(row.position) && "bg-primary/5")}>
                  <th scope="row" className="px-3 py-2 text-left font-mono font-semibold">
                    {row.wire}
                  </th>
                  {showColour ? (
                    <td className="text-muted-foreground px-3 py-2">{row.colour ?? "—"}</td>
                  ) : null}
                  {WIRING_FIELDS.map((field) => {
                    const end = field.startsWith("origin") ? "origin" : "destination";
                    const listValue = pdfValue(wire, field);
                    const edited = row[field] !== listValue;
                    const isRepeated =
                      field.endsWith("Point") && repeated.has(`${row.position}.${end}`);
                    return (
                      <td
                        key={field}
                        className={cn(
                          "px-3 py-1.5 align-top font-mono",
                          field.endsWith("Block") && "border-l",
                          !editing && edited && "bg-warning/10",
                        )}
                      >
                        {editing ? (
                          <Input
                            value={draft[row.position]?.[field] ?? ""}
                            onChange={(event) => setCell(row.position, field, event.target.value)}
                            maxLength={WIRING_TEXT_MAX}
                            aria-label={`${WIRING_FIELD_LABELS[field]} del hilo ${row.wire}`}
                            aria-invalid={isRepeated || undefined}
                            className={cn(
                              "h-8 min-w-20 font-mono",
                              edited && "border-warning",
                              isRepeated && "border-destructive",
                            )}
                          />
                        ) : (
                          <span>{row[field] ?? "—"}</span>
                        )}
                        {edited ? (
                          <span className="text-muted-foreground block font-sans text-xs">
                            Listado: {listValue ?? "vacío"}
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                  {editing ? (
                    <td className="px-2 py-1.5 align-top">
                      {WIRING_FIELDS.some((field) => row[field] !== pdfValue(wire, field)) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => restoreList(wire)}
                          title="Volver a lo que dice el listado"
                          aria-label={`Volver al listado el hilo ${row.wire}`}
                        >
                          <RotateCcwIcon aria-hidden />
                        </Button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing ? (
        <div className="space-y-3">
          {duplicates.length > 0 || serverDuplicates.length > 0 ? (
            <div
              role="alert"
              className="border-destructive/50 bg-destructive/10 space-y-1 rounded-lg border px-3 py-2 text-sm"
            >
              <p className="font-medium">Dos o más hilos van a la misma borna:</p>
              <ul className="list-disc pl-5">
                {(serverDuplicates.length > 0
                  ? serverDuplicates
                  : duplicates.map(describeDuplicate)
                ).map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
              <p className="text-muted-foreground">
                Si en campo está así, puedes guardar igualmente.
              </p>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor={`${switchId}-notes`}>Nota (opcional)</Label>
            <Textarea
              id={`${switchId}-notes`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Por qué cambia: regletero renumerado, borna dañada…"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {serverDuplicates.length > 0 ? (
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() => save(true)}
              >
                Guardar igualmente
              </Button>
            ) : (
              <Button
                type="button"
                disabled={pending || changedCells === 0}
                onClick={() => save(false)}
              >
                {pending
                  ? "Guardando…"
                  : changedCells === 0
                    ? "Sin cambios"
                    : `Guardar ${touched.size === 1 ? "1 hilo" : `${touched.size} hilos`}`}
              </Button>
            )}
            <Button type="button" variant="outline" disabled={pending} onClick={stopEditing}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {result ? (
        <p
          role={result.ok ? "status" : "alert"}
          className={cn("text-sm", result.ok ? "text-success" : "text-destructive")}
        >
          {result.message}
        </p>
      ) : null}

      {jumpers.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Puentes</h3>
          <ul className="bg-card divide-y rounded-lg border text-sm">
            {jumpers.map((jumper) => (
              <li key={jumper.position} className="flex flex-wrap gap-x-3 px-3 py-2 font-mono">
                <span className="font-semibold">{jumper.code}</span>
                <span>
                  {formatTerminal(jumper.fromBlock, jumper.fromPoint)} ↔{" "}
                  {formatTerminal(jumper.toBlock, jumper.toPoint)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
