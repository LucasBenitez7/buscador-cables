/**
 * How the history of a cable reads: one sentence per event ("conectó el extremo de origen")
 * and its changes in a stable order. Shared by the cable record and the activity pages.
 */
import {
  CABLE_EDITABLE_FIELDS,
  type CableAction,
  type ConnectionStatus,
  type FieldChange,
} from "./cables";

/** Order in which an event's changes are shown (Postgres `jsonb` does not keep key order). */
export const CHANGE_FIELD_ORDER = [
  ...CABLE_EDITABLE_FIELDS,
  "installationStatus",
  "connectionStatus",
  "currentLocationId",
  "deletedAt",
] as const;

/** Entries of a stored `changes` object, ordered for display; unknown fields go last. */
export function orderedChanges(changes: unknown): [string, FieldChange][] {
  if (typeof changes !== "object" || changes === null || Array.isArray(changes)) {
    return [];
  }
  const rank = (field: string) => {
    const index = (CHANGE_FIELD_ORDER as readonly string[]).indexOf(field);
    return index === -1 ? CHANGE_FIELD_ORDER.length : index;
  };
  return Object.entries(changes as Record<string, FieldChange>).sort(
    ([a], [b]) => rank(a) - rank(b) || a.localeCompare(b),
  );
}

const CONNECTION_BITS: Record<ConnectionStatus, number> = {
  DISCONNECTED: 0,
  ORIGIN_ONLY: 1,
  DESTINATION_ONLY: 2,
  CONNECTED: 3,
};

/** Which end a connect / disconnect event touched, read from its status change. */
function touchedEnd(changes: unknown): string | null {
  const change = (changes as Record<string, FieldChange> | null)?.connectionStatus;
  const from = CONNECTION_BITS[change?.from as ConnectionStatus];
  const to = CONNECTION_BITS[change?.to as ConnectionStatus];
  if (from === undefined || to === undefined) return null;
  const touched = from ^ to;
  if (touched === 3) return "los dos extremos";
  if (touched === 1) return "el extremo de origen";
  if (touched === 2) return "el extremo de destino";
  return null;
}

export type CableEventForSentence = {
  action: CableAction;
  changes: unknown;
  /** Location names (not ids), already resolved. */
  fromLocation: string | null;
  toLocation: string | null;
};

/**
 * What the user did, as the predicate of a Spanish sentence: "movió el cable de A a B".
 * The caller puts the user's name in front.
 */
export function describeCableEvent(event: CableEventForSentence): string {
  const { fromLocation, toLocation } = event;
  switch (event.action) {
    case "CREATED":
      return toLocation ? `dio de alta el cable en ${toLocation}` : "dio de alta el cable";
    case "UPDATED":
      return "editó los datos del cable";
    case "LAID":
      return "tendió el cable";
    case "COILED":
      return toLocation ? `enrolló el cable en ${toLocation}` : "enrolló el cable";
    case "CONNECTED": {
      const end = touchedEnd(event.changes);
      return end ? `conectó ${end}` : "conectó el cable";
    }
    case "DISCONNECTED": {
      const end = touchedEnd(event.changes);
      return end ? `desconectó ${end}` : "desconectó el cable";
    }
    case "MOVED":
      return fromLocation && toLocation
        ? `movió el cable de ${fromLocation} a ${toLocation}`
        : toLocation
          ? `movió el cable a ${toLocation}`
          : "movió el cable";
    case "RETIRED":
      return "retiró el cable";
    case "CORRECTION":
      return "corrigió un movimiento anterior";
    case "DELETED":
      return "dio de baja el cable";
  }
}
