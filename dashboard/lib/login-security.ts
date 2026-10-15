import { z } from 'zod';
export const loginSchema = z.object({ username: z.string().max(256), password: z.string().max(1024) }).strict();
export async function readLoginBody(request: Request): Promise<unknown> {
  const max = 8192;
  if (Number(request.headers.get('content-length')) > max) throw new RangeError('body');
  if (!request.body) throw new SyntaxError('body');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { void reader.cancel().catch(() => {}); throw new RangeError('body'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
export interface LoginLimiter { limit(options: { key: string }): Promise<{ success: boolean }> }
export interface LoginLimits { LOGIN_RATE_LIMITER?: LoginLimiter; LOGIN_GLOBAL_LIMITER?: LoginLimiter }
export async function workerLoginLimits(): Promise<LoginLimits> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    return getCloudflareContext().env as LoginLimits;
  } catch { return {}; }
}
export async function loginAllowed(request: Request, limits: LoginLimits): Promise<boolean> {
  // Cloudflare supplies this header. Never trust X-Forwarded-For as an identity.
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  try {
    const results = await Promise.allSettled([
      Promise.resolve().then(() => limits.LOGIN_RATE_LIMITER?.limit({ key: 'login:' + ip })),
      Promise.resolve().then(() => limits.LOGIN_GLOBAL_LIMITER?.limit({ key: 'login:all' })),
    ]);
    return results.every(result => result.status !== 'fulfilled' || result.value?.success !== false);
  } catch { return true; } // Local development and unavailable bindings remain usable.
}
