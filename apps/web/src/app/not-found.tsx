import Link from "next/link";
import { Button } from "@/components/ui/button";

// Sustituye la página 404 por defecto de Next, que es negra con texto blanco y no sigue el tema.
export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-sm space-y-4 text-center">
        <p className="text-primary font-mono text-sm font-semibold">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">Página no encontrada</h1>
        <p className="text-muted-foreground text-sm">
          La dirección no existe o el elemento ya no está disponible.
        </p>
        <Button asChild>
          <Link href="/">Volver al inicio</Link>
        </Button>
      </div>
    </main>
  );
}
