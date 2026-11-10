"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { deleteCableAction, type CableFormResult } from "@/features/cables/actions";

type Props = { id: string; code: string; version: number };

/** Baja lógica: el cable y su historial se conservan; se exige el motivo. */
export function DeleteCableForm({ id, code, version }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<CableFormResult | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm(`¿Dar de baja el cable ${code}? Dejará de aparecer en las búsquedas.`)) {
      return;
    }
    const formData = new FormData();
    formData.set("id", id);
    formData.set("version", String(version));
    formData.set("reason", reason);
    startTransition(async () => {
      const outcome = await deleteCableAction(formData);
      setResult(outcome);
      if (outcome.ok) {
        router.push(`/cables?deleted=${encodeURIComponent(code)}`);
      }
    });
  }

  return (
    <form onSubmit={submit} className="border-destructive/30 space-y-3 rounded-lg border p-4">
      <h2 className="text-base font-medium">Dar de baja</h2>
      <p className="text-muted-foreground text-sm">
        El cable deja de aparecer en las búsquedas, pero se conservan sus datos y su historial.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="delete-reason">Motivo de la baja</Label>
        <textarea
          id="delete-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          className="border-input bg-background w-full rounded-lg border px-2.5 py-1.5 text-sm"
          required
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="destructive" disabled={pending || reason.trim().length < 3}>
          {pending ? "Dando de baja…" : "Dar de baja"}
        </Button>
        {result && !result.ok ? (
          <p role="alert" className="text-destructive text-sm">
            {result.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
