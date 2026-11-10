import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
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

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={cn("min-h-full antialiased", geistSans.variable, geistMono.variable)}>
        {children}
      </body>
    </html>
  );
}
