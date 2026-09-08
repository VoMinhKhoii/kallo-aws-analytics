import { NextResponse } from "next/server";
import { authErrorResponse, clearSessionCookie } from "@/lib/auth";
import { isSameOrigin } from "@/lib/auth-config";

export function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return authErrorResponse("Same-origin request required", "CSRF_ORIGIN_REQUIRED", 403);
  }
  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
  clearSessionCookie(response);
  return response;
}
