import { NextResponse } from "next/server";
import {
  authErrorResponse,
  constantTimeEqual,
  createSessionToken,
  setSessionCookie,
} from "@/lib/auth";
import { getAuthConfig, isSameOrigin, type DashboardRole } from "@/lib/auth-config";

import { loginSchema, readLoginBody, loginAllowed, workerLoginLimits } from "@/lib/login-security";

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

  if (!await loginAllowed(request, await workerLoginLimits())) {
    const response = invalidLogin();
    return Response.json(await response.json(), { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  }
  let values;
  try { values = loginSchema.parse(await readLoginBody(request)); }
  catch (error) {
    return error instanceof RangeError
      ? authErrorResponse("Login request is too large", "REQUEST_TOO_LARGE", 413)
      : invalidLogin();
  }

  // Evaluate every configured pair before choosing a role so an attacker
  // cannot use a short-circuiting branch as a credential oracle.
  const founderUsername = constantTimeEqual(values.username, config.founderUsername);
  const founderPassword = constantTimeEqual(values.password, config.founderPassword);
  const reviewerUsername = constantTimeEqual(values.username, config.reviewerUsername);
  const reviewerPassword = constantTimeEqual(values.password, config.reviewerPassword);
  const role: DashboardRole | null = founderUsername && founderPassword
    ? "founder"
    : Boolean(config.reviewerUsername && config.reviewerPassword) && reviewerUsername && reviewerPassword
      ? "reviewer"
      : null;
  if (!role) return invalidLogin();

  const response = NextResponse.json(
    { ok: true, role },
    { headers: { "Cache-Control": "no-store" } },
  );
  setSessionCookie(response, createSessionToken(role), request);
  return response;
}
