import { cableCodeSchema } from "@cables/shared";

/**
 * The cable code of `/cables?deleted=…`, shown in "Cable … dado de baja", or undefined when
 * the value is not a cable code: any other text would appear inside a notice of the app.
 */
export function deletedCableCode(value: string | string[] | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = cableCodeSchema.safeParse(value);
  // Only a code exactly as the app writes it: nothing is normalized into one.
  return parsed.success && parsed.data === value ? value : undefined;
}

/**
 * Decodes a dynamic route segment ("%5F" → "_"). Returns null for a segment that is not
 * valid percent-encoding ("100%"), which `decodeURIComponent` answers with an exception:
 * such a URL names something that does not exist, it is not a server error.
 */
export function decodeRouteParam(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
