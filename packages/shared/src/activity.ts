import { z } from "zod";
import { CABLE_ACTIONS } from "./cables";

/**
 * Filters of the activity pages ("Mi actividad", "Actividad reciente") as they travel in the
 * URL. Like the cable search, an invalid value is ignored instead of failing the page.
 */
export const ACTIVITY_PAGE_SIZE = 50;

const optionalText = z
  .string()
  .trim()
  .max(64)
  .transform((value) => (value === "" ? undefined : value))
  .optional()
  .catch(undefined);

/** "2026-11-12"; `Date.parse` would accept "2026-11-31", so the round trip is checked. */
const day = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  })
  .optional()
  .catch(undefined);

export const activitySearchSchema = z.object({
  actor: optionalText,
  action: z.enum(CABLE_ACTIONS).optional().catch(undefined),
  from: day,
  to: day,
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});

export type ActivitySearch = z.infer<typeof activitySearchSchema>;

export function parseActivitySearch(
  params: Record<string, string | string[] | undefined>,
): ActivitySearch {
  const first: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single !== undefined && single !== "") {
      first[key] = single;
    }
  }
  return activitySearchSchema.parse(first);
}

/** Query string for links, without empty values or page 1. */
export function activityQuery(
  search: ActivitySearch,
  overrides: Partial<ActivitySearch> = {},
): string {
  const merged = { ...search, ...overrides };
  const params = new URLSearchParams();
  for (const key of Object.keys(activitySearchSchema.shape) as (keyof ActivitySearch)[]) {
    const value = merged[key];
    if (value === undefined || (key === "page" && value === 1)) {
      continue;
    }
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
