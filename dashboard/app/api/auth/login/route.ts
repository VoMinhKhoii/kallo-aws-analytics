import { NextResponse } from "next/server";
import {
  authErrorResponse,
  constantTimeEqual,
  createSessionToken,
  setSessionCookie,
} from "@/lib/auth";
import { getAuthConfig, isSameOrigin, type DashboardRole } from "@/lib/auth-config";

const MAX_LOGIN_BODY_BYTES = 8_192;

function invalidLogin(): Response {
  return authErrorResponse("Credentials not accepted", "AUTH_INVALID", 401);
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return authErrorResponse("Same-origin request required", "CSRF_ORIGIN_REQUIRED", 403);
  }

  const config = getAuthConfig();
  if (!config.configured) {
    return authErrorResponse("Dashboard authentication is not configured", "AUTH_NOT_CONFIGURED", 503);
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_LOGIN_BODY_BYTES) {
    return authErrorResponse("Login request is too large", "REQUEST_TOO_LARGE", 413);
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_LOGIN_BODY_BYTES || new TextEncoder().encode(text).byteLength > MAX_LOGIN_BODY_BYTES) {
      return authErrorResponse("Login request is too large", "REQUEST_TOO_LARGE", 413);
    }
    body = JSON.parse(text);
  } catch {
    return invalidLogin();
  }

  if (!body || typeof body !== "object") return invalidLogin();
  const values = body as { username?: unknown; password?: unknown };
  if (typeof values.username !== "string" || typeof values.password !== "string" || values.username.length > 256 || values.password.length > 1_024) {
    return invalidLogin();
  }

  // Evaluate every configured pair before choosing a role so an attacker
  // cannot use a short-circuiting branch as a credential oracle.
  const founderUsername = constantTimeEqual(values.username, config.founderUsername);
  const founderPassword = constantTimeEqual(values.password, config.founderPassword);
  const reviewerUsername = constantTimeEqual(values.username, config.reviewerUsername);
  const reviewerPassword = constantTimeEqual(values.password, config.reviewerPassword);
  const role: DashboardRole | null = founderUsername && founderPassword
    ? "founder"
    : reviewerUsername && reviewerPassword
      ? "reviewer"
      : null;
  if (!role) return invalidLogin();

  const response = NextResponse.json(
    { ok: true, role },
    { headers: { "Cache-Control": "no-store" } },
  );
  setSessionCookie(response, createSessionToken(role));
  return response;
}
