import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { INLINE_LINK } from "@/lib/links";
import { UploadExcelForm } from "@/features/excel-import/components/upload-excel-form";
import { getExcelOverview, type ExcelKindOverview } from "@/server/excel-import/queries";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Excel" };
export const dynamic = "force-dynamic";

const number = new Intl.NumberFormat("es-ES");

export default async function ImportPage() {
  await requirePermission("import:run");
  const overview = await getExcelOverview();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Excel</h1>
      <UploadExcelForm />
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

      {/* El último aplicado, con su archivo a la vista: lo que hay ahora en la web. */}
      <div className="space-y-1.5 border-t pt-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-muted-foreground font-medium">Último aplicado</h3>
          {/* De los dos, el que se aplicó después: lo último que se subió. */}
          {lastApplied?.latest ? <Badge variant="info">El más reciente</Badge> : null}
        </div>
        {lastApplied ? (
          <div
            className={`bg-background space-y-2 rounded-md border px-3 py-2.5 ${lastApplied.latest ? "border-primary/60" : ""}`}
          >
            <Link
              href={`/import/${lastApplied.id}`}
              className={`${INLINE_LINK} font-medium break-all`}
            >
              {lastApplied.fileName}
            </Link>
            <p className="text-muted-foreground">
              Excel del <span className="text-foreground font-medium">{lastApplied.excelDay}</span>{" "}
              · aplicado el {lastApplied.appliedAt} · subido por {lastApplied.uploadedBy}
            </p>
          </div>
        ) : (
          <p>Ninguno todavía.</p>
        )}
      </div>
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
