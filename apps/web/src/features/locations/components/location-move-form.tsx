"use client";

import { useState, useTransition, type FormEvent } from "react";
import { LOCATION_TYPE_LABELS, parentLocationType, type MoveTarget } from "@cables/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { moveLocationAction } from "@/features/locations/actions";
import type { ActionResult } from "@/lib/action-result";
import type { LocationWithCounts } from "@/server/locations/service";

type Props = {
  location: Pick<LocationWithCounts, "id" | "name" | "type">;
  targets: MoveTarget[];
  onDone: () => void;
};

export function LocationMoveForm({ location, targets, onDone }: Props) {
  const [parentId, setParentId] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const parentType = parentLocationType(location.type);
  const selectId = `move-${location.id}`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("id", location.id);
    formData.set("parentId", parentId);
    startTransition(async () => {
      const outcome = await moveLocationAction(formData);
      setResult(outcome);
      if (outcome.ok) {
        onDone();
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="bg-muted/40 flex flex-wrap items-end gap-3 rounded-lg border p-3"
    >
      <div className="min-w-64 flex-1 space-y-1">
        <Label htmlFor={selectId}>
          Mover &quot;{location.name}&quot; a otra{" "}
          {parentType ? LOCATION_TYPE_LABELS[parentType].toLowerCase() : "ubicación"}
        </Label>
        {targets.length === 0 ? (
          <p className="text-muted-foreground text-sm">No hay otro destino posible.</p>
        ) : (
          <select
            id={selectId}
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
            className="border-input bg-background h-8 w-full rounded-lg border px-2.5 text-sm"
            required
          >
            <option value="" disabled>
              Elige el destino…
            </option>
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !parentId}>
          {pending ? "Moviendo…" : "Mover"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
      {result && !result.ok ? (
        <p role="alert" className="text-destructive w-full text-sm">
          {result.message}
        </p>
      ) : null}
    </form>
  );
}
