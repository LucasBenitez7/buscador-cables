import { ListSkeleton, PageSkeleton } from "@/components/loading";

/** Las ubicaciones mientras cargan. */
export default function Loading() {
  return (
    <PageSkeleton>
      <ListSkeleton rows={8} />
    </PageSkeleton>
  );
}
