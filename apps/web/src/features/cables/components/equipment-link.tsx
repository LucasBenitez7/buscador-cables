import Link from "next/link";
import { INLINE_LINK, equipmentHref } from "@/lib/links";

/**
 * An equipment tag that opens its page (every cable that lands in it, by terminal strip);
 * a dash when unknown.
 */
export function EquipmentLink({
  equipment,
  className = "",
}: {
  equipment: string | null;
  className?: string;
}) {
  if (!equipment) return <span>—</span>;
  return (
    <Link
      href={equipmentHref(equipment)}
      title={`Equipo ${equipment}: sus cables y bornas`}
      className={`${INLINE_LINK} font-mono ${className}`}
    >
      {equipment}
    </Link>
  );
}
