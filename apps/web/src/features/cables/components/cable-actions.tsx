"use client";

import { cn } from "cn";
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
  CABLE_END_SIDES,
  CABLE_END_SIDE_LABELS,
  CONNECTION_STATUSES,
  CONNECTION_STATUS_LABELS,
  INSTALLATION_STATUSES,
  INSTALLATION_STATUS_LABELS,
  TEST_RESULTS,
  TEST_RESULT_LABELS,
  TEST_STATUSES,
  TEST_STATUS_LABELS,
  normalizeTrayCode,
  type CableActionAvailability,
  type CableEnd,
  type CableEndSide,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
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
  events?: ActionOption[];
  /** Codes of the trays on the cable's planned route, suggested for the loose end. */
  routeTrays?: string[];
  /**
   * Table rows: one "Acción" button that opens a picker instead of a row of buttons.
   * Corrections stay on the cable record, where the history is visible.
   */
  compact?: boolean;
};

const DESCRIPTIONS: Record<CableFieldAction, string> = {
  LAID: "El cable queda tendido entre su origen y su destino, todavía sin conectar.",
  PARTIALLY_LAID:
    "El cable no llegó a su destino: una punta llega a su equipo y la otra está en una bandeja del camino. Elige la bandeja donde lo has encontrado.",
  COILED: "El cable queda enrollado y desconectado en el sitio que indiques.",
  CONNECTED: "Indica qué extremo has conectado.",
  DISCONNECTED: "Indica qué extremo has desconectado.",
  TESTED:
    "Resultado de timbrar el cable (continuidad e identificación de los conductores). Si falla, explica qué en la nota.",
  MOVED: "Indica a dónde has llevado el cable.",
  RETIRED: "El cable queda fuera de servicio y desconectado. Solo un supervisor puede deshacerlo.",
  CORRECTION:
    "Corrige un movimiento registrado por error. Indica cuál, cómo debe quedar el cable y por qué.",
};

function describe(action: CableFieldAction, state: CableState) {
  if (action === "LAID" && state.installationStatus === "PARTIALLY_LAID") {
    return "La punta suelta llega a su extremo y el cable queda tendido entero. Lo que ya estaba conectado sigue conectado.";
  }
  return DESCRIPTIONS[action];
}

/** The end a technician most likely wants, given what is already connected. */
function defaultEnd(action: "CONNECTED" | "DISCONNECTED", state: CableState): CableEnd {
  const { connectionStatus } = state;
  if (action === "CONNECTED" && state.looseEnd) {
    // Only the end that arrived can be connected.
    return state.looseEnd === "ORIGIN" ? "DESTINATION" : "ORIGIN";
  }
  if (action === "CONNECTED") {
    if (connectionStatus === "ORIGIN_ONLY") return "DESTINATION";
    if (connectionStatus === "DESTINATION_ONLY") return "ORIGIN";
    return "BOTH";
  }
  if (connectionStatus === "ORIGIN_ONLY") return "ORIGIN";
  if (connectionStatus === "DESTINATION_ONLY") return "DESTINATION";
  return "BOTH";
}

/** The end left loose: the current one, or the end that is not connected. */
function defaultLooseEnd(state: CableState): CableEndSide {
  if (state.looseEnd) return state.looseEnd;
  return state.connectionStatus === "DESTINATION_ONLY" ? "ORIGIN" : "DESTINATION";
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
  events = [],
  routeTrays = [],
  compact = false,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<CableFieldAction | null>(null);
  const [picking, setPicking] = useState(false);
  const [result, setResult] = useState<CableFormResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const offered = compact
    ? availability.filter((item) => item.action !== "CORRECTION")
    : availability;
  if (offered.length === 0) {
    return null;
  }
  const blocked = offered.filter((item) => item.disabledReason !== null);
  const current = offered.find((item) => item.action === open);

  function openDialog(action: CableFieldAction) {
    setResult(null);
    setNotice(null);
    setOpen(action);
  }

  function close() {
    setOpen(null);
    setPicking(false);
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
        close();
        setNotice(outcome.message);
        router.refresh();
      }
    });
  }

  const fieldErrors = result && !result.ok ? (result.fieldErrors ?? {}) : {};

  const dialog = (
    <Dialog open={open !== null || picking} onOpenChange={(next) => (next ? null : close())}>
      {open && current ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {current.label} · <span className="font-mono">{code}</span>
            </DialogTitle>
            <DialogDescription>{describe(open, state)}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <ActionFields
              action={open}
              state={state}
              locations={locations}
              events={events}
              routeTrays={routeTrays}
              errors={fieldErrors}
            />
            <NotesField
              required={ACTIONS_REQUIRING_REASON.includes(open)}
              label={open === "TESTED" ? "Nota (obligatoria si falla)" : undefined}
              error={fieldErrors.notes}
            />
            {result && !result.ok ? (
              <p role="alert" className="text-destructive text-sm">
                {result.message}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => (picking ? setOpen(null) : close())}
              >
                {picking ? "← Otra acción" : "Cancelar"}
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
      ) : picking ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Registrar acción · <span className="font-mono">{code}</span>
            </DialogTitle>
            <DialogDescription>Elige qué has hecho con el cable.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {offered.map((item) => (
              <li key={item.action}>
                <Button
                  type="button"
                  variant={item.action === "RETIRED" ? "destructive" : "outline"}
                  className="w-full justify-start"
                  disabled={item.disabledReason !== null}
                  onClick={() => openDialog(item.action)}
                >
                  {item.label}
                </Button>
                {item.disabledReason ? (
                  <p className="text-muted-foreground mt-0.5 px-1 text-xs">{item.disabledReason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </DialogContent>
      ) : null}
    </Dialog>
  );

  if (compact) {
    return (
      <div className="space-y-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setResult(null);
            setNotice(null);
            setPicking(true);
          }}
        >
          Acción
        </Button>
        {notice ? (
          <p role="status" className="text-success max-w-40 text-xs">
            {notice}
          </p>
        ) : null}
        {dialog}
      </div>
    );
  }

  return (
    <section aria-labelledby="cable-actions-title" className="space-y-3">
      <h2 id="cable-actions-title" className="text-base font-medium">
        Acciones
      </h2>
      <div className="flex flex-wrap gap-2">
        {offered.map((item) => (
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
          <summary className="hover:text-foreground focus-visible:ring-ring/50 cursor-pointer rounded-sm transition-colors outline-none select-none focus-visible:ring-3">
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
      {dialog}
    </section>
  );
}

function ActionFields({
  action,
  state,
  locations,
  events,
  routeTrays,
  errors,
}: {
  action: CableFieldAction;
  state: CableState;
  locations: ActionOption[];
  events: ActionOption[];
  routeTrays: string[];
  errors: Record<string, string>;
}) {
  switch (action) {
    case "PARTIALLY_LAID":
      return (
        <>
          <LooseEndChoice defaultValue={defaultLooseEnd(state)} error={errors.looseEnd} />
          <TrayField
            name="trayCode"
            label="Bandeja donde está la punta"
            defaultValue={state.looseEndTray ?? ""}
            routeTrays={routeTrays}
            error={errors.trayCode}
            confirmOffRoute
          />
        </>
      );
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
    case "TESTED":
      return (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Resultado</legend>
          {TEST_RESULTS.map((result) => (
            <label
              key={result}
              className="hover:bg-accent/60 has-checked:bg-accent flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 text-sm transition-colors"
            >
              <input
                type="radio"
                name="result"
                value={result}
                defaultChecked={result === "OK"}
                className="accent-primary"
              />
              {TEST_RESULT_LABELS[result]}
            </label>
          ))}
          {errors.result ? <ErrorText>{errors.result}</ErrorText> : null}
        </fieldset>
      );
    case "CONNECTED":
    case "DISCONNECTED":
      return (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Extremo</legend>
          {CABLE_ENDS.map((end) => (
            <label
              key={end}
              className="hover:bg-accent/60 has-checked:bg-accent flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 text-sm transition-colors"
            >
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
          <Field id="action-test" label="Timbrado correcto" error={errors.testStatus}>
            <Select id="action-test" name="testStatus" defaultValue={state.testStatus}>
              {TEST_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {TEST_STATUS_LABELS[status]}
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
          <Field
            id="action-loose-end"
            label="Punta suelta (si está tendido a medias)"
            error={errors.looseEnd}
          >
            <Select id="action-loose-end" name="looseEnd" defaultValue={state.looseEnd ?? ""}>
              <option value="">Ninguna</option>
              {CABLE_END_SIDES.map((side) => (
                <option key={side} value={side}>
                  {CABLE_END_SIDE_LABELS[side]}
                </option>
              ))}
            </Select>
          </Field>
          <TrayField
            name="looseEndTray"
            label="Bandeja de la punta suelta"
            defaultValue={state.looseEndTray ?? ""}
            routeTrays={routeTrays}
            error={errors.looseEndTray}
          />
        </>
      );
    default:
      return null;
  }
}

function LooseEndChoice({ defaultValue, error }: { defaultValue: CableEndSide; error?: string }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Punta que queda suelta</legend>
      {CABLE_END_SIDES.map((side) => (
        <label
          key={side}
          className="hover:bg-accent/60 has-checked:bg-accent flex min-h-10 cursor-pointer items-center gap-2 rounded-md px-2 text-sm transition-colors"
        >
          <input
            type="radio"
            name="looseEnd"
            value={side}
            defaultChecked={side === defaultValue}
            className="accent-primary"
          />
          {CABLE_END_SIDE_LABELS[side]}
        </label>
      ))}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </fieldset>
  );
}

/**
 * The tray code, typed or picked from the route: its trays are buttons, numbered in route
 * order, so in the field one tap is enough. With `confirmOffRoute`, a tray that is not on the
 * planned route asks for a confirmation instead of being refused.
 */
function TrayField({
  name,
  label,
  defaultValue,
  routeTrays,
  error,
  confirmOffRoute = false,
}: {
  name: string;
  label: string;
  defaultValue: string;
  routeTrays: string[];
  error?: string;
  confirmOffRoute?: boolean;
}) {
  const id = `action-${name}`;
  const [value, setValue] = useState(defaultValue);
  const typed = normalizeTrayCode(value);
  const offRoute =
    confirmOffRoute && typed !== "" && routeTrays.length > 0 && !routeTrays.includes(typed);
  return (
    <Field id={id} label={label} error={error}>
      {routeTrays.length > 0 ? (
        <ol
          aria-label="Bandejas del recorrido"
          className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto"
        >
          {routeTrays.map((code, index) => (
            <li key={code}>
              <button
                type="button"
                aria-pressed={typed === code}
                onClick={() => setValue(code)}
                className={cn(
                  "focus-visible:ring-ring/50 rounded-md border px-2 py-1 font-mono text-xs transition-colors outline-none focus-visible:ring-3",
                  typed === code
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-muted bg-background",
                )}
              >
                <span className="opacity-70">{index + 1}.</span> {code}
              </button>
            </li>
          ))}
        </ol>
      ) : null}
      <Input
        id={id}
        name={name}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={routeTrays.length > 0 ? "O escribe otro código" : "Código de la bandeja"}
        autoComplete="off"
        spellCheck={false}
        className="font-mono uppercase"
        aria-invalid={error ? true : undefined}
      />
      {offRoute ? (
        <label className="border-warning/40 bg-warning/10 flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm">
          <input
            type="checkbox"
            name="confirmOffRoute"
            value="1"
            className="accent-primary mt-0.5"
          />
          <span>
            Esta bandeja no está en su recorrido previsto. Confirmo que el cable está en{" "}
            <span className="font-mono">{typed}</span>.
          </span>
        </label>
      ) : null}
    </Field>
  );
}

function NotesField({
  required,
  label,
  error,
}: {
  required: boolean;
  label?: string;
  error?: string;
}) {
  return (
    <Field
      id="action-notes"
      label={label ?? (required ? "Motivo" : "Nota (opcional)")}
      error={error}
    >
      <Textarea
        id="action-notes"
        name="notes"
        rows={3}
        required={required}
        aria-invalid={error ? true : undefined}
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
  return <NativeSelect {...props} />;
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
