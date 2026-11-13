import { z } from "zod";

/**
 * Pieces shared by the filters that travel in the URL (cable search, activity pages).
 * URLs are shared and edited by hand, so an invalid value is ignored instead of failing.
 */

/** "2026-11-12" (what `<input type="date">` sends). Invalid dates are ignored. */
export const daySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  // `Date.parse` acepta "2026-11-31" y lo convierte en el 1 de diciembre: se exige ida y vuelta.
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  })
  .optional()
  .catch(undefined);

/** Page number of a paginated list. */
export const pageSchema = z.coerce.number().int().min(1).max(10_000).optional().catch(undefined);

/**
 * Page size of a paginated list (`?size=100`). Only the sizes the list offers are accepted, so
 * a hand-edited URL cannot ask the server for thousands of rows at once.
 */
export function pageSizeSchema(sizes: readonly number[]) {
  return z.coerce
    .number()
    .int()
    .refine((value) => sizes.includes(value))
    .optional()
    .catch(undefined);
}

/**
 * The page that, cut in pages of `newSize`, holds the first item of `page` cut in pages of
 * `oldSize`: changing the page size keeps what the user was looking at on screen.
 */
export function repage(page: number, oldSize: number, newSize: number): number {
  return Math.floor(((page - 1) * oldSize) / newSize) + 1;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Next.js `searchParams` as plain strings: repeated keys keep the first value, empty ones go. */
export function firstParams(params: RawSearchParams): Record<string, string> {
  const first: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single !== undefined && single !== "") {
      first[key] = single;
    }
  }
  return first;
}
