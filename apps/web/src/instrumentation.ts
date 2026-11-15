import type { Instrumentation } from "next";
import { logError } from "@/server/log";

/**
 * Every error the server does not handle (pages, actions, routes) goes to the log as one JSON
 * line, with where it happened. Fase 10: sin Sentry de momento; ver docs/DESPLIEGUE.md.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest)
      : undefined;
  logError("request", "Error en el servidor", error, {
    method: request.method,
    // Sin la query: los filtros de la URL pueden llevar datos del cliente.
    path: request.path.split("?")[0],
    route: context.routePath,
    kind: context.routeType,
    digest,
  });
};
