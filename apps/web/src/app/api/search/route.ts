import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { QUICK_SEARCH_MAX, quickSearch } from "@/server/search/quick";
import { getCurrentUser } from "@/server/session";

// Un texto más largo se recorta en vez de rechazarse: se está escribiendo.
const querySchema = z
  .string()
  .catch("")
  .transform((value) => value.slice(0, QUICK_SEARCH_MAX));

/**
 * The suggestions of the search box on the home page, while typing. Only for signed-in users:
 * it answers with the project's cables, trays and equipment. Never cached, not even by the
 * browser: the states change as people work.
 */
export async function GET(request: NextRequest) {
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  }
  const query = querySchema.parse(request.nextUrl.searchParams.get("q") ?? "");
  const results = await quickSearch(query);
  return NextResponse.json(results, { headers: { "Cache-Control": "private, no-store" } });
}
