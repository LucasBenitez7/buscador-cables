import { redirect } from "next/navigation";
import { hasPermission } from "@cables/shared";
import { requireUser } from "@/server/session";

/**
 * «Mi actividad» is now «Actividad» (fase 17). Old links land on the person's own activity:
 * filtered by «Yo» for who sees everyone's, and the page as is for everybody else.
 */
export default async function MyActivityPage() {
  const user = await requireUser();
  redirect(
    hasPermission(user, "activity:view")
      ? `/activity?actor=${encodeURIComponent(user.id)}`
      : "/activity",
  );
}
