import { z } from "zod";
import { CABLE_ACTIONS } from "./cables";
import { daySchema, firstParams, pageSchema, type RawSearchParams } from "./url-params";

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

export const activitySearchSchema = z.object({
  actor: optionalText,
  action: z.enum(CABLE_ACTIONS).optional().catch(undefined),
  from: daySchema,
  to: daySchema,
  page: pageSchema,
});

export type ActivitySearch = z.infer<typeof activitySearchSchema>;

export function parseActivitySearch(params: RawSearchParams): ActivitySearch {
  return activitySearchSchema.parse(firstParams(params));
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
