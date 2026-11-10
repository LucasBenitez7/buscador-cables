import { NextResponse } from "next/server";
import { getHealth } from "@/server/health";

export async function GET() {
  const health = await getHealth();
  return NextResponse.json(health, { status: health.status === "ok" ? 200 : 503 });
}
