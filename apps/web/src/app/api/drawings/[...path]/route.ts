import { NextResponse } from "next/server";
import { readDrawingFile } from "@/server/drawings/store";
import { getCurrentUser } from "@/server/session";

type Params = Promise<{ path: string[] }>;

/**
 * Tiles of the drawings, only for signed-in users: they are the client's drawings. The
 * browser may keep them for a while, but never a shared cache (`private`).
 */
export async function GET(_request: Request, { params }: { params: Params }) {
  if (!(await getCurrentUser())) {
    return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  }
  const file = await readDrawingFile((await params).path);
  if (!file) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
