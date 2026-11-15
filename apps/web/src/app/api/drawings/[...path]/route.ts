import { NextRequest, NextResponse } from "next/server";
import {
  DRAWING_ACCESS_COOKIE,
  createDrawingAccess,
  drawingAccessCookie,
  hasDrawingAccess,
} from "@/server/drawings/access";
import { isDrawingDescriptor, readDrawingFile } from "@/server/drawings/store";
import { getCurrentUser } from "@/server/session";

type Params = Promise<{ path: string[] }>;

/**
 * Tiles of the drawings, only for signed-in users: they are the client's drawings.
 *
 * - The descriptor of a sheet always checks the session and hands out a short signed pass;
 *   its tiles only check the pass, without a database query each (revisión F7.5, M2).
 * - `private, no-cache` + `ETag`: the browser keeps them but asks every time, and the server
 *   checks the access before answering 304. After signing out on a shared tablet the tiles
 *   seen are not served from the cache (M4). Never in a shared cache (`private`).
 */
export async function GET(request: Request, { params }: { params: Params }) {
  const segments = (await params).path;
  const access = new NextRequest(request).cookies.get(DRAWING_ACCESS_COOKIE)?.value;
  const passed = !isDrawingDescriptor(segments) && hasDrawingAccess(access);
  if (!passed && !(await getCurrentUser())) {
    return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  }
  const file = await readDrawingFile(segments);
  if (!file) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const headers = {
    "Cache-Control": "private, no-cache",
    ETag: file.etag,
    "X-Content-Type-Options": "nosniff",
  };
  const response =
    request.headers.get("If-None-Match") === file.etag
      ? new NextResponse(null, { status: 304, headers })
      : new NextResponse(new Uint8Array(file.body), {
          headers: { ...headers, "Content-Type": file.contentType },
        });
  if (!passed) response.cookies.set(drawingAccessCookie(createDrawingAccess()));
  return response;
}
