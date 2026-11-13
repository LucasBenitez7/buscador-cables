import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad que no dependen del despliegue. La CSP completa (scripts, estilos,
 * conexiones) se cierra en la fase 10, con el dominio y los servicios reales delante.
 */
const SECURITY_HEADERS = [
  // La app nunca va dentro de un marco de otro sitio: evita el clickjacking.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  // El navegador no adivina tipos de contenido.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Los códigos de cable y los filtros de la URL no viajan a otros sitios.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

// Las variables de entorno se cargan desde el `.env` de la raíz del monorepo con
// `scripts/next.mjs`, que envuelve la CLI de Next (ver los scripts de package.json).
// Next.js solo carga `.env` desde el directorio de la app, y `next.config.ts` se
// evalúa en un contexto aislado, así que esa vía no propaga las variables al build.
const nextConfig: NextConfig = {
  // La app es interna y casi todo su contenido es dinámico (sesión + búsqueda por
  // query params), así que no activamos `cacheComponents`. Ver docs/ARQUITECTURA.md.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  transpilePackages: ["@cables/shared", "@cables/db"],
  // No anuncia con qué está hecha.
  poweredByHeader: false,
  headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
