import type { Metadata } from "next";
import { hasPermission } from "@cables/shared";
import { LocationTree } from "@/features/locations/components/location-tree";
import { listLocationTree } from "@/server/locations/service";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Ubicaciones" };
export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const user = await requireUser();
  const tree = await listLocationTree();
  const canManage = hasPermission(user.role, "location:manage");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Ubicaciones</h1>
        <p className="text-muted-foreground text-sm">
          Planta → Área → Unidad → Sitio, con su código KKS: <code className="font-mono">80</code>{" "}
          planta, <code className="font-mono">80UB</code> área,{" "}
          <code className="font-mono">80UBA</code> edificio y{" "}
          <code className="font-mono">80UBA04RA001</code> la sala donde empieza o termina un cable.
          Pulsa «N cables» para verlos en el buscador (incluye todo lo que contiene).
        </p>
      </div>
      <LocationTree tree={tree} canManage={canManage} />
    </div>
  );
}
