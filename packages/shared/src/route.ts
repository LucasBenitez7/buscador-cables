/**
 * How far a cable got along its planned route, step by step, for the cable record and the
 * tray pages. Pure: the caller passes the route and the field state.
 */
import type { CableEndSide } from "./cable-actions";
import type { InstallationStatus } from "./cables";

/** "laid": the cable is there; "pending": it has not got there yet; "unknown": not recorded. */
export type RouteStepProgress = "laid" | "pending" | "unknown";

export type RouteProgress = {
  steps: RouteStepProgress[];
  /** Position (0-based) of the tray where the loose end waits, if it is on the route. */
  looseIndex: number | null;
};

export function routeProgress(
  route: readonly { trayCode: string | null }[],
  state: {
    installationStatus: InstallationStatus;
    looseEnd: CableEndSide | null;
    looseEndTray: string | null;
  },
): RouteProgress {
  if (state.installationStatus === "LAID") {
    return { steps: route.map(() => "laid"), looseIndex: null };
  }
  // A route may go through the same tray twice. The record only says "it waits in tray X",
  // so the cable is taken to have got as far as the first time it meets that tray in the
  // direction it is laid: from the origin when the destination end is loose, and back from
  // the destination when the origin end is. Nothing is marked laid that might not be.
  const isLooseTray = (step: { trayCode: string | null }) => step.trayCode === state.looseEndTray;
  const looseIndex =
    state.installationStatus === "PARTIALLY_LAID" && state.looseEndTray
      ? state.looseEnd === "ORIGIN"
        ? route.findLastIndex(isLooseTray)
        : route.findIndex(isLooseTray)
      : -1;
  if (looseIndex === -1 || !state.looseEnd) {
    return { steps: route.map(() => "unknown"), looseIndex: null };
  }
  // The cable runs from the end that arrived up to the tray where the loose end waits.
  const laid = (index: number) =>
    state.looseEnd === "DESTINATION" ? index <= looseIndex : index >= looseIndex;
  return {
    steps: route.map((_, index) => (laid(index) ? "laid" : "pending")),
    looseIndex,
  };
}
