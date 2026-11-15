import { ROLE_LABELS } from "@cables/shared";
import { Dashboard } from "@/features/dashboard/components/dashboard";
import { getDashboard } from "@/server/dashboard/service";
import { requireUser } from "@/server/session";

// Los recuentos se consultan en cada petición, no en el build.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Cada página comprueba la sesión: en una navegación en cliente el layout no se repite.
  const user = await requireUser();
  // El servidor decide qué secciones carga según el rol: lo que no se puede ver no se consulta.
  const dashboard = await getDashboard(user);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Inicio</h1>
        <p className="text-muted-foreground text-sm">
          Hola, <span className="text-foreground font-medium">{user.name}</span> ·{" "}
          {ROLE_LABELS[user.role]}
        </p>
      </div>
      <Dashboard data={dashboard} />
    </div>
  );
}
