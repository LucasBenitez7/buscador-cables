import { ListSkeleton, PageSkeleton, Skeleton } from "@/components/loading";

/** Los usuarios mientras cargan. */
export default function Loading() {
  return (
    <PageSkeleton>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <ListSkeleton rows={5} />
        <Skeleton className="h-96" />
      </div>
    </PageSkeleton>
  );
}
