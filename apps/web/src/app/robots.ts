import type { MetadataRoute } from "next";

/** Herramienta interna con datos del cliente: ningún buscador la indexa. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
