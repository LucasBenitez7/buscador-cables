import type { NextConfig } from "next";

// Las variables de entorno se cargan desde el `.env` de la raíz del monorepo con
// `node --env-file-if-exists` (ver los scripts de package.json). Next.js solo carga
// `.env` desde el directorio de la app, y `next.config.ts` se evalúa en un contexto
// aislado, así que esa vía no propaga las variables al proceso de build.
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
};

export default nextConfig;
