import { NextResponse } from "next/server";
import { getAuthConfig } from "@/lib/auth-config";

export function GET() {
  const config = getAuthConfig();
  return NextResponse.json(
    { configured: config.configured, reason: config.reason },
    { headers: { "Cache-Control": "no-store" } },
  );
}
