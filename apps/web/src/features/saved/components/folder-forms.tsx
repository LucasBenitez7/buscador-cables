"use client";

import { FolderInputIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "cn";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { SECTION_LINK } from "@/components/detail";
import { useChosen } from "@/components/selection";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createFolderAction,
  deleteFolderAction,
  moveItemsAction,
  renameFolderAction,
} from "@/features/saved/actions";

/** «Nueva carpeta» at the top of «Guardados». */
export function NewFolderForm() {
  const [state, action, pending] = useActionState(createFolderAction, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="bg-card space-y-2 rounded-lg border p-4">
      <Label htmlFor="new-folder">Nueva carpeta</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="new-folder"
          name="name"
          required
          maxLength={60}
          placeholder="Armario 80BBA, Pendientes del lunes…"
          className="sm:max-w-sm"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear carpeta"}
        </Button>
      </div>
      {state ? (
        <p
          role={state.ok ? "status" : "alert"}
          className={state.ok ? "text-success text-sm" : "text-destructive text-sm"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/** «Renombrar» and «Borrar carpeta», next to the name of a folder. */
export function FolderActions({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [state, action, pending] = useActionState(
    async (previous: Awaited<ReturnType<typeof renameFolderAction>> | null, data: FormData) => {
      const result = await renameFolderAction(previous, data);
      if (result.ok) setRenaming(false);
      return result;
    },
    null,
  );
  const [deleting, startDeleting] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const remove = () => {
    if (
      !window.confirm(`¿Borrar la carpeta «${name}»? Los cables, bandejas y equipos no se tocan.`)
    ) {
      return;
    }
    startDeleting(async () => {
      const result = await deleteFolderAction(id);
      if (result.ok) router.push("/saved");
      else setError(result.message);
    });
  };

  if (renaming) {
    return (
      <form action={action} className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
        <input type="hidden" name="id" value={id} />
        <Label htmlFor="rename-folder" className="sr-only">
          Nombre de la carpeta
        </Label>
        <Input
          id="rename-folder"
          name="name"
          required
          maxLength={60}
          defaultValue={name}
          autoFocus
          className="sm:max-w-sm"
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setRenaming(false)}>
            Cancelar
          </Button>
        </div>
        {state && !state.ok ? (
          <p role="alert" className="text-destructive text-sm">
            {state.message}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <>
      <button type="button" className={SECTION_LINK} onClick={() => setRenaming(true)}>
        Renombrar
      </button>
      <button
        type="button"
        className={cn(
          SECTION_LINK,
          "text-destructive border-destructive/50 hover:border-destructive",
        )}
        disabled={deleting}
        onClick={remove}
      >
        {deleting ? "Borrando…" : "Borrar carpeta"}
      </button>
      {state?.ok ? (
        <p role="status" className="text-success text-sm">
          {state.message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </>
  );
}

/**
 * «Mover a…» and «Quitar» in the bar of what is chosen in a folder: the keys of the list are
 * the ids of the saved items.
 */
export function FolderChosenActions({
  folderId,
  others,
}: {
  folderId: string;
  others: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { items, finish, notify } = useChosen();
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (toFolderId?: string) =>
    startTransition(async () => {
      setError(null);
      const result = await moveItemsAction({
        folderId,
        itemIds: items.map((item) => item.key),
        toFolderId,
      });
      if (!result.ok) {
        if (moving) setError(result.message);
        else notify(result.message);
        return;
      }
      setMoving(false);
      finish();
      router.refresh();
    });

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={items.length === 0 || others.length === 0 || pending}
        onClick={() => setMoving(true)}
      >
        <FolderInputIcon aria-hidden />
        Mover a…
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={items.length === 0 || pending}
        onClick={() => run()}
      >
        <XIcon aria-hidden />
        Quitar
      </Button>
      <Dialog open={moving} onOpenChange={setMoving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mover a otra carpeta</DialogTitle>
            <DialogDescription>
              {items.length === 1 ? items[0]!.label : `${items.length} elementos`} salen de esta
              carpeta.
            </DialogDescription>
          </DialogHeader>
          <ul className="bg-background max-h-64 divide-y overflow-y-auto rounded-lg border">
            {others.map((folder) => (
              <li key={folder.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(folder.id)}
                  className="hover:bg-muted focus-visible:ring-ring/50 flex min-h-10 w-full items-center px-3 py-2 text-left text-sm outline-none focus-visible:ring-3"
                >
                  {folder.name}
                </button>
              </li>
            ))}
          </ul>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
