import { ListSkeleton, PageSkeleton } from "@/components/loading";

/** La actividad mientras carga. */
export default function Loading() {
  return (
    <PageSkeleton>
      <ListSkeleton rows={10} />
    </PageSkeleton>
  );
}
