import type { MetadataRoute } from "next";

/** Para "Añadir a la pantalla de inicio" en el móvil: nombre, colores e iconos. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Buscador de Cables",
    short_name: "Cables",
    description: "Cada cable de la planta: dónde está, por dónde va y en qué estado.",
    start_url: "/",
    display: "standalone",
    background_color: "#101419",
    theme_color: "#101419",
    icons: [
      { src: "/brand/logo-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/logo-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/logo.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
