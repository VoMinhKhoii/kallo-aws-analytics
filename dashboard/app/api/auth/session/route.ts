import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/auth";

export function GET(request: Request) {
  const access = authorizeRequest(request);
  if ("response" in access) return access.response;
  return NextResponse.json(
    { role: access.session.role, expires_at: new Date(access.session.exp * 1_000).toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
