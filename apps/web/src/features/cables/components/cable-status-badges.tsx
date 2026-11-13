import {
  CONNECTION_STATUS_LABELS,
  INSTALLATION_STATUS_LABELS,
  type ConnectionStatus,
  type InstallationStatus,
} from "@cables/shared";
import { Badge } from "@/components/ui/badge";

type BadgeVariant = "default" | "outline" | "info" | "success" | "warning" | "destructive";

/**
 * Verde: conectado. Azul: tendido. Ámbar: a medias. Rojo: retirado. El resto, neutro.
 * Cada badge lleva un punto del mismo color para distinguir los estados de un vistazo.
 */
const INSTALLATION_VARIANT: Record<InstallationStatus, BadgeVariant> = {
  UNVERIFIED: "outline",
  IN_STOCK: "outline",
  COILED: "default",
  PARTIALLY_LAID: "warning",
  LAID: "info",
  RETIRED: "destructive",
};

const CONNECTION_VARIANT: Record<ConnectionStatus, BadgeVariant> = {
  DISCONNECTED: "outline",
  ORIGIN_ONLY: "warning",
  DESTINATION_ONLY: "warning",
  CONNECTED: "success",
};

export function CableStatusBadges({
  installationStatus,
  connectionStatus,
}: {
  installationStatus: InstallationStatus;
  connectionStatus: ConnectionStatus;
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
    </div>
  );
}
