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

const DESCRIPTION =
  "Cada cable de la planta: dónde está, por dónde va y en qué estado. Acceso para personal autorizado.";

export const metadata: Metadata = {
  title: {
    default: "Buscador de Cables",
    template: "%s | Buscador de Cables",
  },
  description: DESCRIPTION,
  applicationName: "Buscador de Cables",
  metadataBase: new URL(env.APP_URL),
  // La imagen al compartir el enlace (WhatsApp, X, Teams…) son `opengraph-image.png` y
  // `twitter-image.png`, junto a este fichero; el icono, `icon.svg`, `favicon.ico` y
  // `apple-icon.png`. Todos salen de `public/brand/logo.svg`.
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: "Buscador de Cables",
    title: "Buscador de Cables",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: "Buscador de Cables", description: DESCRIPTION },
  appleWebApp: { title: "Cables", statusBarStyle: "black-translucent" },
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
