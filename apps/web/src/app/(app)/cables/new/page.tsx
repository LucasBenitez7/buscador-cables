import type { Metadata } from "next";
import { CableForm } from "@/features/cables/components/cable-form";
import { getCableFormOptions } from "@/server/cables/service";
import { requirePermission } from "@/server/session";

export const metadata: Metadata = { title: "Nuevo cable" };
export const dynamic = "force-dynamic";

export default async function NewCablePage() {
  await requirePermission("cable:create");
  const options = await getCableFormOptions();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nuevo cable</h1>
      <CableForm mode="create" options={options} />
    </div>
  );
}
