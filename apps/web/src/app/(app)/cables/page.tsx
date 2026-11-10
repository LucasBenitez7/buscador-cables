import type { Metadata } from "next";
import Link from "next/link";
import {
  CONNECTION_STATUS_LABELS,
  INSTALLATION_STATUS_LABELS,
  hasPermission,
} from "@cables/shared";
import { Button } from "@/components/ui/button";
import { listRecentCables } from "@/server/cables/service";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Cables" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ deleted?: string }>;

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

export default async function CablesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const { deleted } = await searchParams;
  const cables = await listRecentCables();
  const canCreate = hasPermission(user.role, "cable:create");
  const canEdit = hasPermission(user.role, "cable:update");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Cables</h1>
          <p className="text-muted-foreground text-sm">
            Últimos {cables.length} cables modificados. El buscador con filtros llega en la fase 4.
          </p>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/cables/new">Nuevo cable</Link>
          </Button>
        ) : null}
      </div>

      {deleted ? (
        <p role="status" className="bg-muted rounded-md px-3 py-2 text-sm">
          Cable {deleted} dado de baja.
        </p>
      ) : null}

      {cables.length === 0 ? (
        <p className="text-muted-foreground text-sm">Todavía no hay cables.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Origen → destino</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Modificado</th>
              </tr>
            </thead>
            <tbody>
              {cables.map((cable) => (
                <tr key={cable.id} className="border-t">
                  <td className="px-3 py-2 font-mono font-medium whitespace-nowrap">
                    {canEdit ? (
                      <Link
                        href={`/cables/${cable.id}/edit`}
                        className="underline-offset-4 hover:underline"
                      >
                        {cable.code}
                      </Link>
                    ) : (
                      cable.code
                    )}
                  </td>
                  <td className="px-3 py-2">{cable.type ?? "—"}</td>
                  <td className="px-3 py-2">
                    {cable.origin ?? "—"} → {cable.destination ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {INSTALLATION_STATUS_LABELS[cable.installationStatus]} ·{" "}
                    {CONNECTION_STATUS_LABELS[cable.connectionStatus]}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 whitespace-nowrap">
                    {dateFormat.format(cable.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
