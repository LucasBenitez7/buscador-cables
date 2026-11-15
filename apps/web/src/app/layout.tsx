import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { connection } from "next/server";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Buscador de Cables",
    template: "%s | Buscador de Cables",
  },
  description: "Localización, estado y trazabilidad del cableado de planta.",
  metadataBase: new URL(env.APP_URL),
};

// Barra del navegador en móvil con el mismo fondo que la app (--background).
export const viewport: Viewport = {
  themeColor: "#101419",
  colorScheme: "dark",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Cada página se genera en cada petición: así lleva el nonce de la CSP del proxy en sus
  // scripts (una página estática no lo tendría y el navegador la bloquearía).
  await connection();
  return (
    // Tema único y oscuro: la clase "dark" activa las variantes `dark:` de shadcn/ui.
    <html lang="es" className="dark" suppressHydrationWarning>
      <body className={cn("min-h-full antialiased", geistSans.variable, geistMono.variable)}>
        {children}
      </body>
    </html>
  );
}
