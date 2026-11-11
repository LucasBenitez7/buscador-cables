"use client";

import { Button } from "@/components/ui/button";

// Sustituye la página de error por defecto de Next para que siga el tema oscuro.
// No muestra el mensaje del error: puede contener detalles internos.
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-sm space-y-4 text-center">
        <p className="text-destructive font-mono text-sm font-semibold">Error</p>
        <h1 className="text-2xl font-semibold tracking-tight">Algo ha fallado</h1>
        <p className="text-muted-foreground text-sm">
          No se ha podido cargar esta página. Inténtalo de nuevo y, si sigue fallando, avisa al
          administrador.
        </p>
        <Button onClick={reset}>Reintentar</Button>
      </div>
    </main>
  );
}
