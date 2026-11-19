import type { Metadata } from "next";
import Link from "next/link";
import { SAVED_KIND_LABELS, SAVED_KINDS } from "@cables/shared";
import { NewFolderForm } from "@/features/saved/components/folder-forms";
import { listFolders, type SavedFolderSummary } from "@/server/saved/service";
import { requireUser } from "@/server/session";

export const metadata: Metadata = { title: "Guardados" };
export const dynamic = "force-dynamic";

/** «3 cables · 1 bandeja», or «Vacía». */
function summary(folder: SavedFolderSummary): string {
  if (folder.total === 0) return "Vacía";
  return SAVED_KINDS.filter((kind) => folder.counts[kind] > 0)
    .map((kind) => {
      const count = folder.counts[kind];
      const { singular, plural } = SAVED_KIND_LABELS[kind];
      return `${count} ${count === 1 ? singular : plural.toLowerCase()}`;
    })
    .join(" · ");
}

/** The folders of this person (fase 16): only they see them. */
export default async function SavedPage() {
  const user = await requireUser();
  const folders = await listFolders(user.id);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Guardados</h1>
        <p className="text-muted-foreground text-sm">
          Tus carpetas de cables, bandejas y equipos. Solo las ves tú.
        </p>
      </div>

      <NewFolderForm />

      {folders.length === 0 ? (
        <p
          role="status"
          className="text-muted-foreground rounded-lg border p-6 text-center text-sm"
        >
          Aún no tienes carpetas.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((folder) => (
            <li
              key={folder.id}
              className="bg-card hover:border-primary/50 hover:bg-muted/40 has-focus-visible:ring-ring/50 relative space-y-1 rounded-lg border p-3 text-sm transition-colors has-focus-visible:ring-3"
            >
              <Link
                href={`/saved/${folder.id}`}
                className="text-primary text-base font-semibold break-words outline-none after:absolute after:inset-0 after:rounded-lg"
              >
                {folder.name}
              </Link>
              <p className="text-muted-foreground">{summary(folder)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
