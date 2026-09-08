import { NextRequest, NextResponse } from "next/server";
import { getAuthConfig, isSameOrigin, safeReturnPath, SESSION_COOKIE_NAME } from "@/lib/auth-config";
import { verifySessionTokenEdge } from "@/lib/auth-edge";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/config",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/health",
]);

const READ_ONLY_POST_PATHS = new Set(["/api/analytics"]);

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:css|js|mjs|map|png|jpg|jpeg|gif|webp|svg|ico|webmanifest|txt|xml|woff2?|ttf|otf)).*)"],
};

function isApi(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function noStoreJson(body: Record<string, string>, status: number, headers?: HeadersInit): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function redirectToLogin(request: NextRequest): NextResponse {
  const login = new URL("/login", request.url);
  const next = safeReturnPath(`${request.nextUrl.pathname}${request.nextUrl.search}`);
  if (next !== "/") login.searchParams.set("next", next);
  return NextResponse.redirect(login);
}

function requestCookie(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  const method = request.method.toUpperCase();
  const publicPath = PUBLIC_PATHS.has(pathname);
  const configState = getAuthConfig();

  if (pathname === "/login") {
    if (!configState.configured) return NextResponse.next();
    const session = await verifySessionTokenEdge(requestCookie(request), configState.sessionSecret);
    if (!session) return NextResponse.next();
    const destination = safeReturnPath(request.nextUrl.searchParams.get("next"));
    const destinationUrl = new URL(destination, request.url);
    if (destinationUrl.pathname === "/login") destinationUrl.pathname = "/";
    return NextResponse.redirect(destinationUrl);
  }

  // Authentication endpoints need to remain reachable so users can establish
  // or clear a session. Each handler still validates same-origin requests.
  if (publicPath) return NextResponse.next();

  if (!configState.configured) {
    return isApi(pathname)
      ? noStoreJson({ error: "Dashboard authentication is not configured", code: "AUTH_NOT_CONFIGURED" }, 503)
      : redirectToLogin(request);
  }

  const session = await verifySessionTokenEdge(requestCookie(request), configState.sessionSecret);
  if (!session) {
    return isApi(pathname)
      ? noStoreJson({ error: "Authentication required", code: "AUTH_REQUIRED" }, 401, { "WWW-Authenticate": "Session" })
      : redirectToLogin(request);
  }

  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const founderOnly = !READ_ONLY_POST_PATHS.has(pathname);
    if (founderOnly && session.role !== "founder") {
      return noStoreJson({ error: "Founder role required", code: "ROLE_REQUIRED" }, 403);
    }
    if (!isSameOrigin(request)) {
      return noStoreJson({ error: "Same-origin request required", code: "CSRF_ORIGIN_REQUIRED" }, 403);
    }
  }

  return NextResponse.next();
}
