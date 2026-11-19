import type { ConnectionStatus, InstallationStatus, TestStatus } from "@cables/shared";

/**
 * The colour of each state, the same everywhere: badges, the route list, the marks on the
 * drawings, the legends and the dashboard. Blue is laid, violet is not laid yet (or no data),
 * amber is half done (laid halfway, connected at one end, the loose end), green is connected
 * or tested OK, red is retired or failed. Neutral is for what has no state to show.
 */
export type StatusTone = "laid" | "pending" | "partial" | "connected" | "retired" | "neutral";

export const INSTALLATION_TONE: Record<InstallationStatus, StatusTone> = {
  UNVERIFIED: "pending",
  NOT_LAID: "pending",
  PARTIALLY_LAID: "partial",
  LAID: "laid",
  RETIRED: "retired",
};

export const CONNECTION_TONE: Record<ConnectionStatus, StatusTone> = {
  DISCONNECTED: "neutral",
  ORIGIN_ONLY: "partial",
  DESTINATION_ONLY: "partial",
  CONNECTED: "connected",
};

export const TEST_TONE: Record<TestStatus, StatusTone> = {
  NOT_TESTED: "neutral",
  TESTED_OK: "connected",
  TESTED_FAILED: "retired",
};

export type ToneBadgeVariant =
  "outline" | "laid" | "pending" | "warning" | "success" | "destructive";

export const TONE_BADGE: Record<StatusTone, ToneBadgeVariant> = {
  laid: "laid",
  pending: "pending",
  partial: "warning",
  connected: "success",
  retired: "destructive",
  neutral: "outline",
};

/** Solid fill of the tone: dots, meters, the squares of the legends. */
export const TONE_FILL: Record<StatusTone, string> = {
  laid: "bg-laid",
  pending: "bg-pending",
  partial: "bg-warning",
  connected: "bg-success",
  retired: "bg-destructive",
  neutral: "bg-muted-foreground",
};

/** Just the outline of the tone: the marks on the drawings and the squares of the legends. */
export const TONE_BORDER: Record<StatusTone, string> = {
  laid: "border-laid",
  pending: "border-pending",
  partial: "border-warning",
  connected: "border-success",
  retired: "border-destructive",
  neutral: "border-muted-foreground",
};
