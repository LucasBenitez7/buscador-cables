import type { Metadata } from "next";
import { CatalogTabs } from "@/features/catalogs/components/catalog-tabs";
import { listCatalogs } from "@/server/catalogs/service";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Catálogos" };
export const dynamic = "force-dynamic";

export default async function CatalogsPage() {
  await requirePermission("catalog:manage");
  const catalogs = await listCatalogs();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Catálogos</h1>
        <p className="text-muted-foreground text-sm">
          Valores que se eligen al dar de alta un cable. Un elemento que usa algún cable no se puede
          eliminar, solo renombrar.
        </p>
      </div>
      <CatalogTabs catalogs={catalogs} />
    </div>
  );
}
