import {
  CONNECTION_STATUS_LABELS,
  INSTALLATION_STATUS_LABELS,
  TEST_STATUS_LABELS,
  type ConnectionStatus,
  type InstallationStatus,
  type TestStatus,
} from "@cables/shared";
import { Badge } from "@/components/ui/badge";

type BadgeVariant = "default" | "outline" | "info" | "success" | "warning" | "destructive";

/**
 * Verde: conectado. Azul: tendido. Ámbar: a medias. Rojo: retirado. El resto, neutro.
 * Cada badge lleva un punto del mismo color para distinguir los estados de un vistazo.
 */
export const INSTALLATION_VARIANT: Record<InstallationStatus, BadgeVariant> = {
  UNVERIFIED: "outline",
  IN_STOCK: "outline",
  COILED: "default",
  PARTIALLY_LAID: "warning",
  LAID: "info",
  RETIRED: "destructive",
};

export const CONNECTION_VARIANT: Record<ConnectionStatus, BadgeVariant> = {
  DISCONNECTED: "outline",
  ORIGIN_ONLY: "warning",
  DESTINATION_ONLY: "warning",
  CONNECTED: "success",
};

export const TEST_VARIANT: Record<TestStatus, BadgeVariant> = {
  NOT_TESTED: "outline",
  TESTED_OK: "success",
  TESTED_FAILED: "destructive",
};

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
