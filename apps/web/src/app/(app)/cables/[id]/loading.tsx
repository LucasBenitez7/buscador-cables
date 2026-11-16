import { PageSkeleton, Skeleton } from "@/components/loading";

/** La ficha de un cable mientras carga: datos, recorrido y plano. */
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-48 lg:col-span-2" />
        <Skeleton className="h-48" />
      </div>
      <Skeleton className="h-80" />
    </PageSkeleton>
  );
}
