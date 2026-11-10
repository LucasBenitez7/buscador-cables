import type { Metadata } from "next";
import { CATALOG_KINDS } from "@cables/shared";
import { CatalogSection } from "@/features/catalogs/components/catalog-section";
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
      <div className="grid gap-4 lg:grid-cols-3">
        {CATALOG_KINDS.map((kind) => (
          <CatalogSection key={kind} kind={kind} items={catalogs[kind]} />
        ))}
      </div>
    </div>
  );
}
