import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HealthStatus } from "@/server/health";

const LABELS: Record<HealthStatus, string> = {
  ok: "Conectada",
  error: "Sin conexión",
};

export function HealthCard({ database }: { database: HealthStatus }) {
  const isOk = database === "ok";

  return (
    <Card data-testid="health-card">
      <CardHeader>
        <CardTitle className="text-base">Estado del sistema</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground text-sm">Base de datos</span>
        <span
          data-testid="health-database"
          data-status={database}
          className={
            isOk ? "text-success text-sm font-medium" : "text-destructive text-sm font-medium"
          }
        >
          {LABELS[database]}
        </span>
      </CardContent>
    </Card>
  );
}
