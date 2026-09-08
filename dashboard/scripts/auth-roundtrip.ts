import assert from "node:assert/strict";
import { verifySessionTokenEdge } from "../lib/auth-edge.ts";

/**
 * Exercise the issued-session boundary against a running local dashboard.
 *
 * This deliberately does not print credentials, cookies, or token material:
 * the response from `/api/auth/session` proves the Node route verifier and
 * cookie parser, while the same issued token is checked with the Edge verifier
 * before it is sent back over HTTP. Run after `npm run dev` with the same
 * disposable auth environment:
 *
 *   node --experimental-strip-types scripts/auth-roundtrip.ts
 */
const baseUrl = process.env.DASHBOARD_BASE_URL ?? "http://localhost:3100";
const founderUsername = process.env.DASHBOARD_FOUNDER_USERNAME;
const founderPassword = process.env.DASHBOARD_FOUNDER_PASSWORD;
const reviewerUsername = process.env.DASHBOARD_REVIEWER_USERNAME;
const reviewerPassword = process.env.DASHBOARD_REVIEWER_PASSWORD;
const secret = process.env.DASHBOARD_SESSION_SECRET;

assert.ok(
  founderUsername &&
    founderPassword &&
    reviewerUsername &&
    reviewerPassword &&
    secret,
  "dashboard auth environment is required",
);

async function issuedCookie(
  username: string,
  password: string,
  role: "founder" | "reviewer",
): Promise<string> {
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      Origin: baseUrl,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(login.status, 200, `${role} login should issue a session`);

  const setCookie = login.headers.get("set-cookie");
  assert.ok(setCookie, `${role} login should set the session cookie`);
  const cookie = setCookie.split(";", 1)[0];
  const [cookieName, token] = cookie.split("=", 2);
  assert.equal(cookieName, "kallo_session");
  assert.ok(token, `${role} session cookie should contain a token`);

  const edgeClaims = await verifySessionTokenEdge(token, secret!);
  assert.equal(edgeClaims?.role, role, `${role} Edge verification should accept issued token`);

  const session = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Cookie: cookie },
  });
  assert.equal(session.status, 200, `${role} Node route should accept the issued cookie`);
  const sessionBody = (await session.json()) as { role?: unknown };
  assert.equal(sessionBody.role, role);
  return cookie;
}

const founderCookie = await issuedCookie(founderUsername, founderPassword, "founder");
const reviewerCookie = await issuedCookie(reviewerUsername, reviewerPassword, "reviewer");

// These authorization checks do not invoke Glue: reviewer role rejection and
// founder CSRF rejection happen before the run handler can call its upstream.
const reviewerMutation = await fetch(`${baseUrl}/api/runs`, {
  method: "POST",
  headers: { Cookie: reviewerCookie, Origin: baseUrl },
});
assert.equal(reviewerMutation.status, 403, "reviewer mutation should be rejected");

const founderCrossOrigin = await fetch(`${baseUrl}/api/runs`, {
  method: "POST",
  headers: { Cookie: founderCookie, Origin: "https://attacker.example" },
});
assert.equal(founderCrossOrigin.status, 403, "cross-origin founder mutation should be rejected");

console.log("auth issued-token round-trip passed (founder/reviewer Node + Edge, mutation guards)");
