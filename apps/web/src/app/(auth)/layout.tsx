import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Buscador de Cables</h1>
          <p className="text-muted-foreground text-sm">Acceso para personal autorizado</p>
        </div>
        {children}
      </div>
    </main>
  );
}
