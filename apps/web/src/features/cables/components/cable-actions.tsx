"use client";

import { useRouter } from "next/navigation";
import {
  useState,
  useTransition,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ACTIONS_REQUIRING_REASON,
  CABLE_ENDS,
  CABLE_END_LABELS,
  CONNECTION_STATUSES,
  CONNECTION_STATUS_LABELS,
  INSTALLATION_STATUSES,
  INSTALLATION_STATUS_LABELS,
  type CableActionAvailability,
  type CableEnd,
  type CableFieldAction,
  type CableState,
} from "@cables/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { runCableActionAction, type CableFormResult } from "@/features/cables/actions";

export type ActionOption = { id: string; label: string };

type Props = {
  cableId: string;
  code: string;
  version: number;
  state: CableState;
  /** Computed on the server with `cableActionAvailability` for the current user. */
  availability: CableActionAvailability[];
  locations: ActionOption[];
  /** History entries a supervisor can correct, newest first. */
  events: ActionOption[];
};

const DESCRIPTIONS: Record<CableFieldAction, string> = {
  LAID: "El cable queda tendido entre su origen y su destino, todavía sin conectar.",
  COILED: "El cable queda enrollado y desconectado en el sitio que indiques.",
  CONNECTED: "Indica qué extremo has conectado.",
  DISCONNECTED: "Indica qué extremo has desconectado.",
  MOVED: "Indica a dónde has llevado el cable.",
  RETIRED: "El cable queda fuera de servicio y desconectado. Solo un supervisor puede deshacerlo.",
  CORRECTION:
    "Corrige un movimiento registrado por error. Indica cuál, cómo debe quedar el cable y por qué.",
};

/** The end a technician most likely wants, given what is already connected. */
function defaultEnd(action: "CONNECTED" | "DISCONNECTED", state: CableState): CableEnd {
  const { connectionStatus } = state;
  if (action === "CONNECTED") {
    if (connectionStatus === "ORIGIN_ONLY") return "DESTINATION";
    if (connectionStatus === "DESTINATION_ONLY") return "ORIGIN";
    return "BOTH";
  }
  if (connectionStatus === "ORIGIN_ONLY") return "ORIGIN";
  if (connectionStatus === "DESTINATION_ONLY") return "DESTINATION";
  return "BOTH";
}

/**
 * Field actions on the cable record: one button per action the user's role allows. Buttons
 * that make no sense in the current state stay visible but disabled, with the reason below.
 * Each action opens a short dialog; the server validates everything again.
 */
export function CableActions({
  cableId,
  code,
  version,
  state,
  availability,
  locations,
  events,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<CableFieldAction | null>(null);
  const [result, setResult] = useState<CableFormResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (availability.length === 0) {
    return null;
  }
  const blocked = availability.filter((item) => item.disabledReason !== null);
  const current = availability.find((item) => item.action === open);

  function openDialog(action: CableFieldAction) {
    setResult(null);
    setNotice(null);
    setOpen(action);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!open) return;
    const formData = new FormData(event.currentTarget);
    formData.set("cableId", cableId);
    formData.set("version", String(version));
    formData.set("action", open);
    startTransition(async () => {
      const outcome = await runCableActionAction(formData);
      setResult(outcome);
      if (outcome.ok) {
        setOpen(null);
        setNotice(outcome.message);
        router.refresh();
      }
    });
  }

  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {};

  return (
    <section aria-labelledby="cable-actions-title" className="space-y-3">
      <h2 id="cable-actions-title" className="text-base font-medium">
        Acciones
      </h2>
      <div className="flex flex-wrap gap-2">
        {availability.map((item) => (
          <Button
            key={item.action}
            type="button"
            variant={item.action === "RETIRED" ? "destructive" : "outline"}
            disabled={item.disabledReason !== null}
            title={item.disabledReason ?? undefined}
            onClick={() => openDialog(item.action)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      {notice ? (
        <p role="status" className="text-success text-sm">
          {notice}
        </p>
      ) : null}
      {blocked.length > 0 ? (
        <details className="text-muted-foreground text-sm">
          <summary className="cursor-pointer select-none">
            Por qué hay acciones desactivadas
          </summary>
          <ul className="mt-2 space-y-1 pl-4">
            {blocked.map((item) => (
              <li key={item.action}>
                <span className="text-foreground">{item.label}:</span> {item.disabledReason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <Dialog open={open !== null} onOpenChange={(next) => (next ? null : setOpen(null))}>
        {open && current ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {current.label} · <span className="font-mono">{code}</span>
              </DialogTitle>
              <DialogDescription>{DESCRIPTIONS[open]}</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4" noValidate>
              <ActionFields
                action={open}
                state={state}
                locations={locations}
                events={events}
                errors={fieldErrors}
              />
              <NotesField
                required={ACTIONS_REQUIRING_REASON.includes(open)}
                error={fieldErrors.notes}
              />
              {result && !result.ok ? (
                <p role="alert" className="text-destructive text-sm">
                  {result.message}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(null)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant={open === "RETIRED" ? "destructive" : "default"}
                  disabled={pending}
                >
                  {pending ? "Guardando…" : current.label}
                </Button>
              </div>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  );
}

function ActionFields({
  action,
  state,
  locations,
  events,
  errors,
}: {
  action: CableFieldAction;
  state: CableState;
  locations: ActionOption[];
  events: ActionOption[];
  errors: Record<string, string>;
}) {
  switch (action) {
    case "COILED":
      return (
        <Field id="action-location" label="Dónde queda enrollado" error={errors.locationId}>
          <LocationSelect name="locationId" locations={locations} defaultValue="" />
        </Field>
      );
    case "MOVED":
      return (
        <Field id="action-location" label="Nuevo sitio" error={errors.locationId}>
          <LocationSelect
            name="locationId"
            locations={locations.filter((location) => location.id !== state.currentLocationId)}
            defaultValue=""
          />
        </Field>
      );
    case "CONNECTED":
    case "DISCONNECTED":
      return (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Extremo</legend>
          {CABLE_ENDS.map((end) => (
            <label key={end} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="end"
                value={end}
                defaultChecked={end === defaultEnd(action, state)}
                className="accent-primary"
              />
              {CABLE_END_LABELS[end]}
            </label>
          ))}
          {errors.end ? <ErrorText>{errors.end}</ErrorText> : null}
        </fieldset>
      );
    case "CORRECTION":
      return (
        <>
          <Field id="action-event" label="Movimiento que corriges" error={errors.correctsEventId}>
            <Select id="action-event" name="correctsEventId" defaultValue="">
              <option value="" disabled>
                Elige un movimiento
              </option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id="action-installation"
            label="Estado de instalación correcto"
            error={errors.installationStatus}
          >
            <Select
              id="action-installation"
              name="installationStatus"
              defaultValue={state.installationStatus}
            >
              {INSTALLATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {INSTALLATION_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id="action-connection"
            label="Estado de conexión correcto"
            error={errors.connectionStatus}
          >
            <Select
              id="action-connection"
              name="connectionStatus"
              defaultValue={state.connectionStatus}
            >
              {CONNECTION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {CONNECTION_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            id="action-location"
            label="Dónde está (si no está tendido)"
            error={errors.currentLocationId}
          >
            <LocationSelect
              name="currentLocationId"
              locations={locations}
              defaultValue={state.currentLocationId ?? ""}
              emptyLabel="Sin ubicación física"
            />
          </Field>
        </>
      );
    default:
      return null;
  }
}

function NotesField({ required, error }: { required: boolean; error?: string }) {
  return (
    <Field id="action-notes" label={required ? "Motivo" : "Nota (opcional)"} error={error}>
      <textarea
        id="action-notes"
        name="notes"
        rows={3}
        required={required}
        aria-invalid={error ? true : undefined}
        className="border-input bg-background aria-invalid:border-destructive w-full rounded-lg border px-2.5 py-1.5 text-sm"
      />
    </Field>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </div>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-destructive text-sm">{children}</p>;
}

function Select(props: ComponentProps<"select">) {
  return (
    <select
      {...props}
      className="border-input bg-background h-8 w-full rounded-lg border px-2.5 text-sm"
    />
  );
}

function LocationSelect({
  name,
  locations,
  defaultValue,
  emptyLabel,
}: {
  name: string;
  locations: ActionOption[];
  defaultValue: string;
  emptyLabel?: string;
}) {
  return (
    <Select id="action-location" name={name} defaultValue={defaultValue}>
      <option value="" disabled={!emptyLabel}>
        {emptyLabel ?? "Elige una ubicación"}
      </option>
      {locations.map((location) => (
        <option key={location.id} value={location.id}>
          {location.label}
        </option>
      ))}
    </Select>
  );
}
