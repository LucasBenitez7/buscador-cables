import { HealthCard } from "@/features/system/components/health-card";
import { getHealth } from "@/server/health";
import { requireUser } from "@/server/session";

// El estado de la base de datos se consulta en cada petición, no en el build.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Cada página comprueba la sesión: en una navegación en cliente el layout no se repite.
  await requireUser();
  const health = await getHealth();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Inicio</h1>
        <p className="text-muted-foreground text-sm">
          Busca un cable por su código en Cables para ver su ficha, su recorrido y su estado.
        </p>
      </div>
      <HealthCard database={health.database} />
    </div>
  );
}
