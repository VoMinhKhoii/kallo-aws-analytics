/**
 * Dashboard authentication configuration that is safe to import from the
 * Edge middleware and client-facing route handlers.  Credential values are
 * intentionally never returned to a response or included in a session.
 */

export const SESSION_COOKIE_NAME = "kallo_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const MIN_PASSWORD_CHARS = 12;
export const MIN_SESSION_SECRET_CHARS = 32;

export const COOKIE_SECURE_ENV_NAME = "DASHBOARD_COOKIE_SECURE";

export const AUTH_ENV_NAMES = [
  "DASHBOARD_FOUNDER_USERNAME",
  "DASHBOARD_FOUNDER_PASSWORD",
  "DASHBOARD_REVIEWER_USERNAME",
  "DASHBOARD_REVIEWER_PASSWORD",
  "DASHBOARD_SESSION_SECRET",
] as const;

export type DashboardRole = "founder" | "reviewer";

export type AuthConfig = {
  configured: boolean;
  reason: string | null;
  founderUsername: string;
  founderPassword: string;
  reviewerUsername: string;
  reviewerPassword: string;
  sessionSecret: string;
};

type Environment = Record<string, string | undefined>;

const EMPTY_CONFIG: AuthConfig = {
  configured: false,
  reason: "Dashboard authentication is not configured.",
  founderUsername: "",
  founderPassword: "",
  reviewerUsername: "",
  reviewerPassword: "",
  sessionSecret: "",
};

function environment(): Environment {
  // `process.env` is replaced by Next.js in Edge bundles.  Keeping the
  // lookup behind this function also makes the pure config check testable.
  return typeof process === "undefined" ? {} : process.env;
}

/**
 * Keep session cookies HTTPS-only unless a deployment explicitly opts into
 * the classroom lab's HTTP-only ALB. Production hosts such as Vercel never
 * need to set this override.
 */
export function shouldUseSecureSessionCookies(env: Environment = environment()): boolean {
  return env[COOKIE_SECURE_ENV_NAME]?.trim().toLowerCase() !== "false";
}

/** Return configuration status without exposing any secret values. */
export function getAuthConfig(env: Environment = environment()): AuthConfig {
  const founderUsername = env.DASHBOARD_FOUNDER_USERNAME ?? "";
  const founderPassword = env.DASHBOARD_FOUNDER_PASSWORD ?? "";
  const reviewerUsername = env.DASHBOARD_REVIEWER_USERNAME ?? "";
  const reviewerPassword = env.DASHBOARD_REVIEWER_PASSWORD ?? "";
  const sessionSecret = env.DASHBOARD_SESSION_SECRET ?? "";

  const missing = AUTH_ENV_NAMES.filter((name) => !env[name]?.trim());
  const weak = [
    founderPassword.length < MIN_PASSWORD_CHARS ? "DASHBOARD_FOUNDER_PASSWORD" : null,
    reviewerPassword.length < MIN_PASSWORD_CHARS ? "DASHBOARD_REVIEWER_PASSWORD" : null,
    sessionSecret.length < MIN_SESSION_SECRET_CHARS ? "DASHBOARD_SESSION_SECRET" : null,
  ].filter((name): name is string => name !== null);
  const invalid = founderUsername === reviewerUsername ? ["DASHBOARD_FOUNDER_USERNAME", "DASHBOARD_REVIEWER_USERNAME"] : [];
  const problemNames = [...new Set([...missing, ...weak, ...invalid])];

  if (problemNames.length > 0) {
    return {
      ...EMPTY_CONFIG,
      reason: `Dashboard authentication requires valid values for: ${problemNames.join(", ")}.`,
    };
  }

  return {
    configured: true,
    reason: null,
    founderUsername,
    founderPassword,
    reviewerUsername,
    reviewerPassword,
    sessionSecret,
  };
}

/**
 * Accept only a same-origin path.  The value is reduced to path/query/hash so
 * it cannot turn a login redirect into an external redirect.
 */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || value.length > 2_048 || /[\u0000-\u001f\u007f\\]/.test(value)) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const parsed = new URL(value, "https://kallo.invalid");
    if (parsed.origin !== "https://kallo.invalid" || !parsed.pathname.startsWith("/")) return "/";
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

function normaliseOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Require an Origin header that matches the request's trusted origin.  Vercel
 * and ALB deployments may expose the original host through forwarded headers;
 * those are accepted only as a complete, canonical origin.
 */
export function isSameOrigin(request: Request): boolean {
  const supplied = request.headers.get("origin");
  const suppliedOrigin = supplied ? normaliseOrigin(supplied) : null;
  if (!suppliedOrigin) return false;

  const expected = new Set<string>();
  const requestOrigin = normaliseOrigin(new URL(request.url).origin);
  if (requestOrigin) expected.add(requestOrigin);

  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
  if (forwardedProto && forwardedHost && /^[a-z][a-z\d+.-]*$/i.test(forwardedProto) && /^[^\s/:]+(?::\d+)?$/i.test(forwardedHost)) {
    const forwardedOrigin = normaliseOrigin(`${forwardedProto}://${forwardedHost}`);
    if (forwardedOrigin) expected.add(forwardedOrigin);
  }

  return expected.has(suppliedOrigin);
}
