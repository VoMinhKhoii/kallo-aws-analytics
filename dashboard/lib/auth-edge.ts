import { decodeBase64UrlBytes, parseSessionClaims, splitSessionToken, type SessionClaims } from "./session-format.ts";

/**
 * Next's Edge type definitions model Uint8Array with an ArrayBufferLike
 * backing store, while this decoder always creates a fresh Uint8Array with a
 * regular ArrayBuffer. Keep that runtime representation unchanged: unlike a
 * copied ArrayBuffer, Edge's `subtle.verify` accepts this direct view in the
 * standalone production middleware bundle. The assertion is type-only.
 */
function edgeBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return bytes as unknown as Uint8Array<ArrayBuffer>;
}

/** Edge-compatible HMAC verification for middleware; never imports node:crypto. */
export async function verifySessionTokenEdge(
  token: string | null | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): Promise<SessionClaims | null> {
  const parts = splitSessionToken(token);
  if (!parts || !secret) return null;
  const signature = decodeBase64UrlBytes(parts.signature);
  if (!signature) return null;
  try {
    const key = await globalThis.crypto.subtle.importKey(
      "raw",
      edgeBytes(new TextEncoder().encode(secret)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const verified = await globalThis.crypto.subtle.verify(
      "HMAC",
      key,
      edgeBytes(signature),
      edgeBytes(new TextEncoder().encode(parts.payload)),
    );
    return verified ? parseSessionClaims(parts.payload, nowSeconds) : null;
  } catch {
    return null;
  }
}
