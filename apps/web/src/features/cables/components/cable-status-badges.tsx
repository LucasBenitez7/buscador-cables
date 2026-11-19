import {
  CONNECTION_STATUS_LABELS,
  INSTALLATION_STATUS_LABELS,
  TEST_STATUS_LABELS,
  type ConnectionStatus,
  type InstallationStatus,
  type TestStatus,
} from "@cables/shared";
import { Badge } from "@/components/ui/badge";
import {
  CONNECTION_TONE,
  INSTALLATION_TONE,
  TEST_TONE,
  TONE_BADGE,
  type StatusTone,
  type ToneBadgeVariant,
} from "@/features/cables/status-tones";

/**
 * The badge of each state, in the colours of `status-tones.ts`: the same as on the drawings,
 * the route and the dashboard. Each badge has a dot of its colour, to tell them apart at a
 * glance in a long list.
 */
const variants = <T extends string>(tones: Record<T, StatusTone>) =>
  Object.fromEntries(
    Object.entries(tones).map(([status, tone]) => [status, TONE_BADGE[tone as StatusTone]]),
  ) as Record<T, ToneBadgeVariant>;

export const INSTALLATION_VARIANT = variants(INSTALLATION_TONE);
export const CONNECTION_VARIANT = variants(CONNECTION_TONE);
export const TEST_VARIANT = variants(TEST_TONE);

/**
 * Installation and connection, and the timbrado when there is one. `showUntested` also shows
 * "Sin timbrar" (the cable record); lists leave it out so the rows stay short.
 */
export function CableStatusBadges({
  installationStatus,
  connectionStatus,
  testStatus = "NOT_TESTED",
  showUntested = false,
}: {
  installationStatus: InstallationStatus;
  connectionStatus: ConnectionStatus;
  testStatus?: TestStatus;
  showUntested?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge
        dot
        variant={INSTALLATION_VARIANT[installationStatus]}
        data-status={installationStatus}
      >
        {INSTALLATION_STATUS_LABELS[installationStatus]}
      </Badge>
      <Badge dot variant={CONNECTION_VARIANT[connectionStatus]} data-status={connectionStatus}>
        {CONNECTION_STATUS_LABELS[connectionStatus]}
      </Badge>
      {testStatus !== "NOT_TESTED" || showUntested ? (
        <Badge dot variant={TEST_VARIANT[testStatus]} data-status={testStatus}>
          {TEST_STATUS_LABELS[testStatus]}
        </Badge>
      ) : null}
    </div>
  );
}
