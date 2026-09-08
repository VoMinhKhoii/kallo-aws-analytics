import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  getAuthConfig,
  isSameOrigin,
  shouldUseSecureSessionCookies,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  type DashboardRole,
} from "./auth-config.ts";
import { encodeSessionClaims, parseSessionClaims, splitSessionToken, type SessionClaims } from "./session-format.ts";

export function constantTimeEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(role: DashboardRole, nowSeconds = Math.floor(Date.now() / 1_000)): string {
  const config = getAuthConfig();
  if (!config.configured) throw new Error("Dashboard authentication is not configured");
  const claims: SessionClaims = { v: 1, role, iat: nowSeconds, exp: nowSeconds + SESSION_TTL_SECONDS };
  const payload = encodeSessionClaims(claims);
  return `${payload}.${sign(payload, config.sessionSecret)}`;
}

export function verifySessionToken(
  token: string | null | undefined,
  secret = getAuthConfig().sessionSecret,
  nowSeconds = Math.floor(Date.now() / 1_000),
): SessionClaims | null {
  const parts = splitSessionToken(token);
  if (!parts || !secret) return null;
  const expected = sign(parts.payload, secret);
  const suppliedBytes = Buffer.from(parts.signature, "base64url");
  const expectedBytes = Buffer.from(expected, "base64url");
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) return null;
  return parseSessionClaims(parts.payload, nowSeconds);
}

function requestCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const chunk of cookieHeader.split(";")) {
    const separator = chunk.indexOf("=");
    if (separator < 0) continue;
    if (chunk.slice(0, separator).trim() === SESSION_COOKIE_NAME) return chunk.slice(separator + 1).trim();
  }
  return null;
}

export function getSessionFromRequest(request: Request): SessionClaims | null {
  const config = getAuthConfig();
  if (!config.configured) return null;
  return verifySessionToken(requestCookie(request), config.sessionSecret);
}

function authResponse(message: string, code: string, status: number): Response {
  return Response.json(
    { error: message, code },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function authErrorResponse(message: string, code: string, status: number): Response {
  return authResponse(message, code, status);
}

export function authorizeRequest(
  request: Request,
  options: { role?: DashboardRole; sameOrigin?: boolean } = {},
): { session: SessionClaims } | { response: Response } {
  const config = getAuthConfig();
  if (!config.configured) return { response: authResponse("Dashboard authentication is not configured", "AUTH_NOT_CONFIGURED", 503) };
  const session = getSessionFromRequest(request);
  if (!session) return { response: authResponse("Authentication required", "AUTH_REQUIRED", 401) };
  if (options.role && session.role !== options.role) return { response: authResponse("Founder role required", "ROLE_REQUIRED", 403) };
  if (options.sameOrigin && !isSameOrigin(request)) return { response: authResponse("Same-origin request required", "CSRF_ORIGIN_REQUIRED", 403) };
  return { session };
}

const cookieOptions = {
  httpOnly: true,
  secure: shouldUseSecureSessionCookies(),
  sameSite: "strict" as const,
  path: "/",
};

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set({ name: SESSION_COOKIE_NAME, value: token, ...cookieOptions, maxAge: SESSION_TTL_SECONDS });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({ name: SESSION_COOKIE_NAME, value: "", ...cookieOptions, maxAge: 0 });
}
