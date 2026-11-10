import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasPermission } from "@cables/shared";
import { CableForm } from "@/features/cables/components/cable-form";
import { DeleteCableForm } from "@/features/cables/components/delete-cable-form";
import { getCableForEdit, getCableFormOptions } from "@/server/cables/service";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Editar cable" };
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ created?: string; saved?: string }>;

export default async function EditCablePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const user = await requirePermission("cable:update");
  const [{ id }, { created, saved }] = await Promise.all([params, searchParams]);
  const [cable, options] = await Promise.all([getCableForEdit(id), getCableFormOptions()]);
  if (!cable) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Cable <span className="font-mono">{cable.code}</span>
      </h1>
      {created ? (
        <p role="status" className="bg-muted rounded-md px-3 py-2 text-sm">
          Cable dado de alta. Puedes seguir completando sus datos.
        </p>
      ) : saved ? (
        <p role="status" className="bg-muted rounded-md px-3 py-2 text-sm">
          Cambios guardados.
        </p>
      ) : null}
      {/* La clave fuerza a recargar los valores tras guardar (nueva versión). */}
      <CableForm key={cable.version} mode="edit" options={options} cable={cable} />
      {hasPermission(user.role, "cable:delete") ? (
        <DeleteCableForm id={cable.id} code={cable.code} version={cable.version} />
      ) : null}
    </div>
  );
}
