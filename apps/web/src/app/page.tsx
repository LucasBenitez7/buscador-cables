import { HealthCard } from "@/features/system/components/health-card";
import { getHealth } from "@/server/health";

// El estado de la base de datos debe consultarse en cada petición, no en el build.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const health = await getHealth();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Buscador de Cables</h1>
        <p className="text-muted-foreground">
          Localización, estado y trazabilidad del cableado de planta.
        </p>
      </div>

      <HealthCard database={health.database} />

      <p className="text-muted-foreground text-xs">
        Fase 0: la búsqueda de cables y el inicio de sesión llegan en las próximas fases.
      </p>
    </main>
  );
}
