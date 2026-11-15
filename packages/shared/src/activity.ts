import { z } from "zod";
import { CABLE_ACTIONS } from "./cables";
import {
  daySchema,
  firstParams,
  pageSchema,
  pageSizeSchema,
  type RawSearchParams,
} from "./url-params";

/**
 * Filters of the activity pages ("Mi actividad", "Actividad reciente") as they travel in the
 * URL. Like the cable search, an invalid value is ignored instead of failing the page.
 */
export const ACTIVITY_PAGE_SIZE = 50;
/** Page sizes the activity pages offer; the first one is the default. */
export const ACTIVITY_PAGE_SIZES = [ACTIVITY_PAGE_SIZE, 100, 200] as const;

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
  size: pageSizeSchema(ACTIVITY_PAGE_SIZES),
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
    if (
      value === undefined ||
      (key === "page" && value === 1) ||
      (key === "size" && value === ACTIVITY_PAGE_SIZE)
    ) {
      continue;
    }
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
