import { SESSION_TTL_SECONDS, type DashboardRole } from "./auth-config.ts";

export type SessionClaims = {
  v: 1;
  role: DashboardRole;
  iat: number;
  exp: number;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

export function encodeBase64UrlBytes(bytes: Uint8Array): string {
  return bytesToBase64Url(bytes);
}

export function decodeBase64UrlBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 8_192) return null;
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

export function encodeSessionClaims(claims: SessionClaims): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
}

export function splitSessionToken(token: string | null | undefined): { payload: string; signature: string } | null {
  if (!token || token.length > 12_000) return null;
  const separator = token.indexOf(".");
  if (separator <= 0 || separator !== token.lastIndexOf(".")) return null;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!decodeBase64UrlBytes(payload) || !decodeBase64UrlBytes(signature)) return null;
  return { payload, signature };
}

export function parseSessionClaims(
  encodedPayload: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): SessionClaims | null {
  const bytes = decodeBase64UrlBytes(encodedPayload);
  if (!bytes) return null;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object") return null;
    const claims = parsed as Partial<SessionClaims>;
    if (claims.v !== 1 || (claims.role !== "founder" && claims.role !== "reviewer")) return null;
    if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)) return null;
    if (claims.iat! > nowSeconds + 60 || claims.exp! <= nowSeconds || claims.exp! <= claims.iat!) return null;
    if (claims.exp! - claims.iat! > SESSION_TTL_SECONDS + 60) return null;
    return { v: 1, role: claims.role, iat: claims.iat!, exp: claims.exp! };
  } catch {
    return null;
  }
}
