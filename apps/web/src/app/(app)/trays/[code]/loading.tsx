import { ListSkeleton, PageSkeleton, Skeleton } from "@/components/loading";

/** La ficha de una bandeja mientras carga: el plano y sus cables. */
export default function Loading() {
  return (
    <PageSkeleton>
      <Skeleton className="h-[28rem]" />
      <ListSkeleton rows={5} />
    </PageSkeleton>
  );
}
