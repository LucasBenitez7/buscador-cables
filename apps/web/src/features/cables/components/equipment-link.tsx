import Link from "next/link";
import { INLINE_LINK, equipmentCablesHref } from "@/lib/links";

/** An equipment tag that opens every cable starting or ending at it; a dash when unknown. */
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
      href={equipmentCablesHref(equipment)}
      title={`Cables del equipo ${equipment}`}
      className={`${INLINE_LINK} font-mono ${className}`}
    >
      {equipment}
    </Link>
  );
}
