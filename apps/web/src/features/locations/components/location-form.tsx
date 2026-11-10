"use client";

import { useActionState, useEffect, useState } from "react";
import { LOCATION_TYPE_LABELS, type LocationType } from "@cables/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLocationAction, updateLocationAction } from "@/features/locations/actions";
import type { ActionResult } from "@/lib/action-result";

type Props =
  | { mode: "create"; type: LocationType; parentId: string | null; onDone: () => void }
  | {
      mode: "edit";
      location: { id: string; name: string; code: string; type: LocationType };
      onDone: () => void;
    };

export function LocationForm(props: Props) {
  const action = props.mode === "create" ? createLocationAction : updateLocationAction;
  const [result, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);
  const { onDone } = props;
  // Campos controlados: React 19 vacía los no controlados al terminar la acción,
  // y si el servidor devuelve un error el usuario perdería lo que escribió.
  const [name, setName] = useState(props.mode === "edit" ? props.location.name : "");
  const [code, setCode] = useState(props.mode === "edit" ? props.location.code : "");

  useEffect(() => {
    if (result?.ok) {
      onDone();
    }
  }, [result, onDone]);

  const type = props.mode === "create" ? props.type : props.location.type;
  const idPrefix = props.mode === "create" ? `new-${props.parentId ?? "root"}` : props.location.id;

  return (
    <form
      action={formAction}
      className="bg-muted/40 grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_10rem_auto]"
    >
      {props.mode === "create" ? (
        <>
          <input type="hidden" name="type" value={props.type} />
          <input type="hidden" name="parentId" value={props.parentId ?? ""} />
        </>
      ) : (
        <input type="hidden" name="id" value={props.location.id} />
      )}

      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-name`}>
          Nombre ({LOCATION_TYPE_LABELS[type].toLowerCase()})
        </Label>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          autoFocus
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-code`}>Código</Label>
        <Input
          id={`${idPrefix}-code`}
          name="code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className="uppercase"
          required
        />
      </div>
      <div className="flex items-end gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Guardando…" : props.mode === "create" ? "Crear" : "Guardar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>

      {result && !result.ok ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-3">
          {result.message}
        </p>
      ) : null}
    </form>
  );
}
