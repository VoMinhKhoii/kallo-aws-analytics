import assert from "node:assert/strict";
import { AUTH_ENV_NAMES, getAuthConfig, isSameOrigin, safeReturnPath, shouldUseSecureSessionCookies } from "../lib/auth-config.ts";
import { verifySessionTokenEdge } from "../lib/auth-edge.ts";
import { encodeSessionClaims, encodeBase64UrlBytes, parseSessionClaims, type SessionClaims } from "../lib/session-format.ts";

const configured = getAuthConfig({
  DASHBOARD_FOUNDER_USERNAME: "founder",
  DASHBOARD_FOUNDER_PASSWORD: "founder-password-12",
  DASHBOARD_REVIEWER_USERNAME: "reviewer",
  DASHBOARD_REVIEWER_PASSWORD: "reviewer-password-12",
  DASHBOARD_SESSION_SECRET: "a-session-secret-that-is-at-least-32-chars",
});
assert.equal(configured.configured, true);
assert.equal(getAuthConfig({}).configured, false);
assert.deepEqual(AUTH_ENV_NAMES.length, 5);
assert.equal(shouldUseSecureSessionCookies({}), true);
assert.equal(shouldUseSecureSessionCookies({ DASHBOARD_COOKIE_SECURE: "false" }), false);
assert.equal(shouldUseSecureSessionCookies({ DASHBOARD_COOKIE_SECURE: "FALSE" }), false);
assert.equal(shouldUseSecureSessionCookies({ DASHBOARD_COOKIE_SECURE: "true" }), true);

assert.equal(safeReturnPath("/system?from=login"), "/system?from=login");
assert.equal(safeReturnPath("https://external.example/"), "/");
assert.equal(safeReturnPath("//external.example/"), "/");
assert.equal(safeReturnPath("/\\external.example"), "/");
assert.equal(safeReturnPath("/login?next=/system#return"), "/login?next=/system#return");

const now = 1_800_000_000;
const claims: SessionClaims = { v: 1, role: "reviewer", iat: now, exp: now + 3_600 };
const payload = encodeSessionClaims(claims);
assert.deepEqual(parseSessionClaims(payload, now), claims);
assert.equal(parseSessionClaims(payload, now + 3_601), null);
assert.equal(parseSessionClaims(encodeSessionClaims({ ...claims, role: "founder", exp: now + 60 * 60 * 24 }), now), null);

const key = await globalThis.crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(configured.sessionSecret),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"],
);
const signature = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
const token = `${payload}.${encodeBase64UrlBytes(new Uint8Array(signature))}`;
assert.deepEqual(await verifySessionTokenEdge(token, configured.sessionSecret, now), claims);
assert.equal(await verifySessionTokenEdge(`${payload}.bad`, configured.sessionSecret, now), null);

assert.equal(isSameOrigin(new Request("https://console.example/api/auth/login", { method: "POST", headers: { Origin: "https://console.example" } })), true);
assert.equal(isSameOrigin(new Request("https://console.example/api/auth/login", { method: "POST", headers: { Origin: "https://attacker.example" } })), false);
assert.equal(isSameOrigin(new Request("https://console.example/api/auth/login", { method: "POST" })), false);

console.log("auth checks passed");
