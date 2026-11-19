import type { Metadata } from "next";
import Link from "next/link";
import { ADMIN_ROLE } from "@cables/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UploadExcelForm } from "@/features/excel-import/components/upload-excel-form";
import { getExcelOverview, type ExcelKindOverview } from "@/server/excel-import/queries";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Excel del día" };
export const dynamic = "force-dynamic";

const number = new Intl.NumberFormat("es-ES");

export default async function ImportPage() {
  const user = await requirePermission("import:run");
  const overview = await getExcelOverview();
  const projectLoadKinds =
    user.role === ADMIN_ROLE
      ? overview.filter((item) => item.projectLoadAvailable).map((item) => item.kind)
      : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Excel del día</h1>
      <UploadExcelForm projectLoadKinds={projectLoadKinds} />
      <div className="grid gap-4 md:grid-cols-2">
        {overview.map((item) => (
          <KindCard key={item.kind} item={item} />
        ))}
      </div>
    </div>
  );
}

function KindCard({ item }: { item: ExcelKindOverview }) {
  const { current, lastApplied } = item;
  return (
    <section
      aria-labelledby={`excel-${item.kind}`}
      className="bg-card space-y-3 rounded-lg border p-4"
    >
      <h2 id={`excel-${item.kind}`} className="text-base font-semibold">
        {item.label}
      </h2>

      {current ? (
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Vista previa del Excel del {current.excelDay}</span>
              {current.status === "APPLYING" ? <Badge variant="warning">Aplicándose</Badge> : null}
              {current.projectLoad ? <Badge variant="info">Carga del proyecto</Badge> : null}
            </div>
            <p className="text-muted-foreground text-sm">
              Subido por {current.uploadedBy} · {current.uploadedAt}
            </p>
          </div>
          <dl className="flex flex-wrap gap-2 text-sm">
            <Count label="Cambios" value={current.counts.changes} />
            <Count label="Nuevos" value={current.counts.created} />
            <Count
              label="Discrepancias"
              value={current.counts.discrepancies}
              tone={current.counts.discrepancies > 0 ? "warning" : undefined}
            />
          </dl>
          <Button asChild>
            <Link href={`/import/${current.id}`}>Revisar</Link>
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Sin vista previa pendiente.</p>
      )}

      <p className="border-t pt-3 text-sm">
        <span className="text-muted-foreground">Último aplicado: </span>
        {lastApplied ? (
          <>
            <span className="font-medium">Excel del {lastApplied.excelDay}</span>
            <span className="text-muted-foreground"> · subido por {lastApplied.uploadedBy}</span>
          </>
        ) : (
          <span className="font-medium">ninguno</span>
        )}
      </p>
    </section>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone?: "warning" }) {
  return (
    <div
      className={
        tone === "warning"
          ? "bg-warning/15 text-warning flex items-baseline gap-1.5 rounded-full px-3 py-1"
          : "bg-secondary flex items-baseline gap-1.5 rounded-full px-3 py-1"
      }
    >
      <dt>{label}</dt>
      <dd className="font-semibold tabular-nums">{number.format(value)}</dd>
    </div>
  );
}
