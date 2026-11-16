import { ListSkeleton, PageSkeleton, Skeleton } from "@/components/loading";

/** El buscador de cables mientras carga: filtros y filas. */
export default function Loading() {
  return (
    <PageSkeleton>
      <Skeleton className="h-24" />
      <ListSkeleton rows={10} />
    </PageSkeleton>
  );
}
