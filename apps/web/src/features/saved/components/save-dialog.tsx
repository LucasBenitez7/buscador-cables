"use client";

import { BookmarkIcon } from "lucide-react";
import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";
import type { SavedKind, SavedRef } from "@cables/shared";
import { SECTION_LINK } from "@/components/detail";
import { useChosen } from "@/components/selection";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { foldersForAction, saveItemsAction, type FolderChoice } from "@/features/saved/actions";

type Props = {
  refs: SavedRef[];
  /** What is being saved, for the title: «99XAT10W2001», «25 cables». */
  what: string;
  /** Opens the dialog; it gets `open` to call. */
  trigger: (open: () => void) => ReactNode;
  /** Says how it went somewhere else (the bar of a list); without it, next to the button. */
  onSaved?: (message: string) => void;
};

/**
 * «Guardar» (fase 16): the folders of this person, ticked where `refs` already are (half
 * ticked when only some are), and a new folder. Ticking adds, unticking takes out.
 */
export function SaveDialog({ refs, what, trigger, onSaved }: Props) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<FolderChoice[] | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [newFolder, setNewFolder] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  const full = (folder: FolderChoice) => folder.holds >= refs.length;

  const show = () => {
    setOpen(true);
    setFolders(null);
    setMessage(null);
    setNewFolder("");
    startLoading(async () => {
      const result = await foldersForAction(refs);
      if (!result.ok) {
        setMessage({ ok: false, text: result.message });
        return;
      }
      setFolders(result.folders);
      setTicked(new Set(result.folders.filter(full).map((folder) => folder.id)));
    });
  };

  const changed = (folders ?? []).filter(
    (folder) =>
      ticked.has(folder.id) !== full(folder) && (ticked.has(folder.id) || folder.holds > 0),
  );
  const canSave = changed.length > 0 || newFolder.trim().length > 0;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;
    setMessage(null);
    startSaving(async () => {
      const result = await saveItemsAction({
        refs,
        add: changed.filter((folder) => ticked.has(folder.id)).map((folder) => folder.id),
        remove: changed.filter((folder) => !ticked.has(folder.id)).map((folder) => folder.id),
        newFolder: newFolder.trim() || undefined,
      });
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setOpen(false);
        onSaved?.(result.message);
      }
    });
  };

  return (
    <>
      {trigger(show)}
      {message?.ok && !open && !onSaved ? (
        <p role="status" className="text-success text-sm">
          {message.text}
        </p>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Guardar {what}</DialogTitle>
          </DialogHeader>
          <form id={formId} onSubmit={submit} className="space-y-4">
            {loading || folders === null ? (
              <p className="text-muted-foreground text-sm">{loading ? "Cargando…" : null}</p>
            ) : folders.length === 0 ? (
              <p className="text-muted-foreground text-sm">Aún no tienes carpetas.</p>
            ) : (
              <ul className="bg-background max-h-64 divide-y overflow-y-auto rounded-lg border">
                {folders.map((folder) => (
                  <li key={folder.id}>
                    <label className="flex min-h-10 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={ticked.has(folder.id)}
                        ref={(input) => {
                          // A medias: solo algunas de las cosas elegidas están ya en ella.
                          if (input) {
                            input.indeterminate =
                              !ticked.has(folder.id) && folder.holds > 0 && !full(folder);
                          }
                        }}
                        onChange={() =>
                          setTicked((current) => {
                            const next = new Set(current);
                            if (next.has(folder.id)) next.delete(folder.id);
                            else next.add(folder.id);
                            return next;
                          })
                        }
                        className="accent-primary size-5 shrink-0 md:size-4"
                      />
                      <span className="min-w-0 break-words">{folder.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-new`}>Nueva carpeta</Label>
              <Input
                id={`${formId}-new`}
                value={newFolder}
                maxLength={60}
                placeholder="Armario 80BBA, Pendientes del lunes…"
                onChange={(event) => setNewFolder(event.target.value)}
              />
            </div>
            {message && !message.ok ? (
              <p role="alert" className="text-destructive text-sm">
                {message.text}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!canSave || saving || loading}>
                {saving ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** «Guardar» next to the code of a record (cable, tray, equipment). */
export function SaveRecordButton({
  kind,
  itemKey,
  label,
}: {
  kind: SavedKind;
  itemKey: string;
  label: string;
}) {
  return (
    <SaveDialog
      refs={[{ kind, key: itemKey }]}
      what={label}
      trigger={(open) => (
        <button type="button" onClick={open} className={SECTION_LINK}>
          Guardar
        </button>
      )}
    />
  );
}

/** «Guardar» in the bar of what is chosen in a list (fase 15). */
export function SaveChosenButton({ kind }: { kind: SavedKind }) {
  const { items, notify } = useChosen();
  const noun = kind === "CABLE" ? "cables" : kind === "TRAY" ? "bandejas" : "equipos";
  return (
    <SaveDialog
      refs={items.map((item) => ({ kind, key: item.key }))}
      what={
        items.length === 1 ? items[0]!.label : `${items.length.toLocaleString("es-ES")} ${noun}`
      }
      onSaved={notify}
      trigger={(open) => (
        <Button type="button" variant="outline" disabled={items.length === 0} onClick={open}>
          <BookmarkIcon aria-hidden />
          Guardar
        </Button>
      )}
    />
  );
}
