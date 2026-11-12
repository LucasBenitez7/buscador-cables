/**
 * Field actions on a cable (phase 5): the state machine shared by the server, which applies
 * them, and the UI, which only offers what is allowed.
 *
 * Pure functions: no database, no React. The server validates the input with
 * `cableActionSchema`, checks the permission with `canRunCableAction` and computes the new
 * state with `applyCableAction` inside the same transaction that writes the CableEvent.
 */
import { z } from "zod";
import {
  CONNECTION_STATUSES,
  INSTALLATION_STATUSES,
  diffFields,
  type CableAction,
  type ConnectionStatus,
  type FieldChange,
  type InstallationStatus,
} from "./cables";
import { hasPermission, type Permission, type Role } from "./permissions";

export const CABLE_FIELD_ACTIONS = [
  "LAID",
  "COILED",
  "CONNECTED",
  "DISCONNECTED",
  "MOVED",
  "RETIRED",
  "CORRECTION",
] as const satisfies readonly CableAction[];

export type CableFieldAction = (typeof CABLE_FIELD_ACTIONS)[number];

/** Button labels (infinitive); the history uses CABLE_ACTION_LABELS (past participle). */
export const CABLE_FIELD_ACTION_LABELS: Record<CableFieldAction, string> = {
  LAID: "Tender",
  COILED: "Enrollar",
  CONNECTED: "Conectar",
  DISCONNECTED: "Desconectar",
  MOVED: "Mover",
  RETIRED: "Retirar",
  CORRECTION: "Corregir",
};

export const CABLE_ACTION_PERMISSIONS: Record<CableFieldAction, Permission> = {
  LAID: "cable:lay",
  COILED: "cable:coil",
  CONNECTED: "cable:connect",
  DISCONNECTED: "cable:disconnect",
  MOVED: "cable:move",
  RETIRED: "cable:retire",
  CORRECTION: "cable:correct",
};

/** Actions whose note is mandatory: they must say why. */
export const ACTIONS_REQUIRING_REASON: readonly CableFieldAction[] = ["RETIRED", "CORRECTION"];

export const CABLE_ENDS = ["ORIGIN", "DESTINATION", "BOTH"] as const;
export type CableEnd = (typeof CABLE_ENDS)[number];

export const CABLE_END_LABELS: Record<CableEnd, string> = {
  ORIGIN: "Extremo de origen",
  DESTINATION: "Extremo de destino",
  BOTH: "Ambos extremos",
};

/** The part of a cable the state machine reads and writes. */
export type CableState = {
  installationStatus: InstallationStatus;
  connectionStatus: ConnectionStatus;
  currentLocationId: string | null;
  originId: string | null;
  destinationId: string | null;
  deleted: boolean;
};

/** Fields an action can change, in the order the history shows them. */
export const CABLE_STATE_FIELDS = [
  "installationStatus",
  "connectionStatus",
  "currentLocationId",
] as const;

export type CableStateField = (typeof CABLE_STATE_FIELDS)[number];
export type CableStateValues = Pick<CableState, CableStateField>;

export type CableActionInput =
  | { action: "LAID" }
  | { action: "COILED"; locationId: string }
  | { action: "CONNECTED"; end: CableEnd }
  | { action: "DISCONNECTED"; end: CableEnd }
  | { action: "MOVED"; locationId: string }
  | { action: "RETIRED" }
  | {
      action: "CORRECTION";
      correctsEventId: string;
      installationStatus: InstallationStatus;
      connectionStatus: ConnectionStatus;
      currentLocationId: string | null;
    };

export type CableActionOutcome =
  | {
      ok: true;
      next: CableStateValues;
      changes: Partial<Record<CableStateField, FieldChange>>;
      /** For the CableEvent of a physical move (COILED, MOVED). */
      fromLocationId: string | null;
      toLocationId: string | null;
    }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Connection ends as bits: origin = 1, destination = 2.
// ---------------------------------------------------------------------------

const CONNECTION_BITS: Record<ConnectionStatus, number> = {
  DISCONNECTED: 0,
  ORIGIN_ONLY: 1,
  DESTINATION_ONLY: 2,
  CONNECTED: 3,
};
const STATUS_BY_BITS: ConnectionStatus[] = [
  "DISCONNECTED",
  "ORIGIN_ONLY",
  "DESTINATION_ONLY",
  "CONNECTED",
];
const END_BITS: Record<CableEnd, number> = { ORIGIN: 1, DESTINATION: 2, BOTH: 3 };

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** Coherence rules every resulting state must satisfy. Returns an error or null. */
export function validateCableState(
  state: CableStateValues & Pick<CableState, "originId" | "destinationId">,
) {
  const { installationStatus, connectionStatus, currentLocationId } = state;
  if (installationStatus !== "LAID" && connectionStatus !== "DISCONNECTED") {
    return "Solo un cable tendido puede estar conectado.";
  }
  if (installationStatus === "LAID" && (!state.originId || !state.destinationId)) {
    return "Un cable tendido necesita origen y destino.";
  }
  if (installationStatus === "LAID" && currentLocationId !== null) {
    return "Un cable tendido no tiene ubicación física aparte de su recorrido.";
  }
  if (
    (installationStatus === "IN_STOCK" || installationStatus === "COILED") &&
    !currentLocationId
  ) {
    return "Indica dónde está el cable (almacén o lugar donde está enrollado).";
  }
  return null;
}

function computeNext(
  state: CableState,
  input: CableActionInput,
): { next: CableStateValues } | { error: string } {
  const current: CableStateValues = {
    installationStatus: state.installationStatus,
    connectionStatus: state.connectionStatus,
    currentLocationId: state.currentLocationId,
  };
  const status = state.installationStatus;

  if (input.action !== "CORRECTION" && status === "RETIRED") {
    return { error: "El cable está retirado. Solo un supervisor puede corregir su estado." };
  }

  switch (input.action) {
    case "LAID": {
      if (status === "LAID") return { error: "El cable ya está tendido." };
      if (!state.originId || !state.destinationId) {
        return { error: "Para tender el cable, primero indica su origen y su destino." };
      }
      return {
        next: {
          installationStatus: "LAID",
          connectionStatus: "DISCONNECTED",
          currentLocationId: null,
        },
      };
    }
    case "COILED": {
      if (status === "COILED") {
        return { error: "El cable ya está enrollado. Para cambiarlo de sitio, usa Mover." };
      }
      return {
        next: {
          installationStatus: "COILED",
          connectionStatus: "DISCONNECTED",
          currentLocationId: input.locationId,
        },
      };
    }
    case "CONNECTED": {
      if (status !== "LAID") return { error: "Solo se puede conectar un cable tendido." };
      const bits = CONNECTION_BITS[state.connectionStatus];
      const end = END_BITS[input.end];
      if ((bits & end) === end) {
        return { error: "El cable ya está conectado por ese extremo." };
      }
      return { next: { ...current, connectionStatus: STATUS_BY_BITS[bits | end]! } };
    }
    case "DISCONNECTED": {
      const bits = CONNECTION_BITS[state.connectionStatus];
      const end = END_BITS[input.end];
      if (bits === 0) {
        return { error: "El cable no está conectado." };
      }
      if ((bits & end) === 0) {
        return { error: "El cable no está conectado por ese extremo." };
      }
      return { next: { ...current, connectionStatus: STATUS_BY_BITS[bits & ~end]! } };
    }
    case "MOVED": {
      if (status === "LAID") {
        return {
          error: "Un cable tendido no se mueve: primero enróllalo o desconéctalo y enróllalo.",
        };
      }
      if (input.locationId === state.currentLocationId) {
        return { error: "El cable ya está en esa ubicación." };
      }
      return { next: { ...current, currentLocationId: input.locationId } };
    }
    case "RETIRED": {
      return {
        next: {
          installationStatus: "RETIRED",
          connectionStatus: "DISCONNECTED",
          currentLocationId: status === "LAID" ? null : state.currentLocationId,
        },
      };
    }
    case "CORRECTION": {
      return {
        next: {
          installationStatus: input.installationStatus,
          connectionStatus: input.connectionStatus,
          currentLocationId: input.currentLocationId,
        },
      };
    }
  }
}

/**
 * Applies an action to a cable. Returns the new state values and the `{ from, to }` changes
 * for the CableEvent, or an error message in Spanish when the action is not valid now.
 * Permissions are checked separately with `canRunCableAction`.
 */
export function applyCableAction(state: CableState, input: CableActionInput): CableActionOutcome {
  if (state.deleted) {
    return { ok: false, error: "El cable está dado de baja y no admite acciones." };
  }

  const result = computeNext(state, input);
  if ("error" in result) {
    return { ok: false, error: result.error };
  }

  const coherenceError = validateCableState({
    ...result.next,
    originId: state.originId,
    destinationId: state.destinationId,
  });
  if (coherenceError) {
    return { ok: false, error: coherenceError };
  }

  const changes = diffFields(CABLE_STATE_FIELDS, state, result.next);
  if (Object.keys(changes).length === 0) {
    return { ok: false, error: "La acción no cambia nada en el cable." };
  }

  const movesPhysically = input.action === "COILED" || input.action === "MOVED";
  return {
    ok: true,
    next: result.next,
    changes,
    fromLocationId: movesPhysically ? state.currentLocationId : null,
    toLocationId: movesPhysically ? result.next.currentLocationId : null,
  };
}

export function canRunCableAction(role: Role, action: CableFieldAction): boolean {
  return hasPermission(role, CABLE_ACTION_PERMISSIONS[action]);
}

export type CableActionAvailability = {
  action: CableFieldAction;
  label: string;
  /** Why the button is disabled, or null when it can be used. */
  disabledReason: string | null;
};

/**
 * The actions a user may see for a cable: those their role allows, each with the reason it
 * is disabled in the cable's current state (if any). Actions that need extra input are
 * checked with the least demanding value (any location, the first end not yet connected…).
 */
export function cableActionAvailability(role: Role, state: CableState): CableActionAvailability[] {
  return CABLE_FIELD_ACTIONS.filter((action) => canRunCableAction(role, action)).map((action) => ({
    action,
    label: CABLE_FIELD_ACTION_LABELS[action],
    disabledReason: probe(state, action),
  }));
}

function probe(state: CableState, action: CableFieldAction): string | null {
  // A location that differs from the current one, so "already there" never blocks the probe.
  const anyOtherLocation = `${state.currentLocationId ?? ""}~probe`;
  const attemptsByAction: Record<CableFieldAction, CableActionInput[]> = {
    LAID: [{ action: "LAID" }],
    COILED: [{ action: "COILED", locationId: anyOtherLocation }],
    CONNECTED: CABLE_ENDS.map((end) => ({ action: "CONNECTED", end })),
    DISCONNECTED: CABLE_ENDS.map((end) => ({ action: "DISCONNECTED", end })),
    MOVED: [{ action: "MOVED", locationId: anyOtherLocation }],
    RETIRED: [{ action: "RETIRED" }],
    // A correction can always be attempted; its target state is validated when sent.
    CORRECTION: [],
  };
  const attempts = attemptsByAction[action];

  if (state.deleted) return "El cable está dado de baja y no admite acciones.";
  // Retired cables only accept a correction (checked above); everything else explains why.
  let lastError: string | null = null;
  for (const attempt of attempts) {
    const outcome = applyCableAction(state, attempt);
    if (outcome.ok) return null;
    lastError = outcome.error;
  }
  return lastError;
}

// ---------------------------------------------------------------------------
// Input schema (FormData strings from the action dialogs)
// ---------------------------------------------------------------------------

const requiredId = (message: string) => z.string({ error: message }).trim().min(1, message);

const versionField = z.coerce
  .number({ error: "Versión no válida" })
  .int("Versión no válida")
  .min(1, "Versión no válida");

const optionalNotes = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? "")
  .pipe(z.string().max(2000, "La nota no puede superar 2000 caracteres"))
  .transform((value) => (value === "" ? null : value));

const reasonNotes = z
  .string({ error: "Indica el motivo" })
  .trim()
  .min(3, "Indica el motivo")
  .max(2000, "El motivo no puede superar 2000 caracteres");

const common = { cableId: requiredId("Cable no válido"), version: versionField };
const endField = z.enum(CABLE_ENDS, { error: "Elige qué extremo" });
const locationField = requiredId("Elige una ubicación");

export const cableActionSchema = z.discriminatedUnion(
  "action",
  [
    z.object({ ...common, action: z.literal("LAID"), notes: optionalNotes }),
    z.object({
      ...common,
      action: z.literal("COILED"),
      locationId: locationField,
      notes: optionalNotes,
    }),
    z.object({ ...common, action: z.literal("CONNECTED"), end: endField, notes: optionalNotes }),
    z.object({ ...common, action: z.literal("DISCONNECTED"), end: endField, notes: optionalNotes }),
    z.object({
      ...common,
      action: z.literal("MOVED"),
      locationId: locationField,
      notes: optionalNotes,
    }),
    z.object({ ...common, action: z.literal("RETIRED"), notes: reasonNotes }),
    z.object({
      ...common,
      action: z.literal("CORRECTION"),
      correctsEventId: requiredId("Elige el movimiento que corriges"),
      installationStatus: z.enum(INSTALLATION_STATUSES, {
        error: "Estado de instalación no válido",
      }),
      connectionStatus: z.enum(CONNECTION_STATUSES, { error: "Estado de conexión no válido" }),
      currentLocationId: z
        .string()
        .optional()
        .transform((value) => (value?.trim() ? value.trim() : null)),
      notes: reasonNotes,
    }),
  ],
  { error: "Acción no válida" },
);

export type CableActionRequest = z.infer<typeof cableActionSchema>;

/** Splits a validated request into the state machine input and the event metadata. */
export function toCableActionInput(request: CableActionRequest): CableActionInput {
  switch (request.action) {
    case "LAID":
    case "RETIRED":
      return { action: request.action };
    case "COILED":
    case "MOVED":
      return { action: request.action, locationId: request.locationId };
    case "CONNECTED":
    case "DISCONNECTED":
      return { action: request.action, end: request.end };
    case "CORRECTION":
      return {
        action: "CORRECTION",
        correctsEventId: request.correctsEventId,
        installationStatus: request.installationStatus,
        connectionStatus: request.connectionStatus,
        currentLocationId: request.currentLocationId,
      };
  }
}
