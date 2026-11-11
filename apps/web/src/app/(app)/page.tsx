import { HealthCard } from "@/features/system/components/health-card";
import { getHealth } from "@/server/health";

// El estado de la base de datos se consulta en cada petición, no en el build.
export const dynamic = "force-dynamic";

export default async function HomePage() {
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
