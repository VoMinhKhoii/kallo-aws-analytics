import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { authorizeRequest } from '@/lib/auth';
import { connectAdminDb } from '@/lib/admin/db/client';
export const dynamic = 'force-dynamic';

// Kallo stores feedback screenshots in the private R2 bucket
// kallo-prod-feedback-screenshots (JPEG/PNG/WebP, 5 MB). The Worker reads it
// through the SCREENSHOTS binding and streams it to the signed-in founder; no
// URL to the object ever leaves the Worker.
interface ScreenshotBucket { get(key: string): Promise<{ body: ReadableStream; size: number; httpMetadata?: { contentType?: string } } | null> }
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
async function bucket(): Promise<ScreenshotBucket | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    return (getCloudflareContext().env as { SCREENSHOTS?: ScreenshotBucket }).SCREENSHOTS ?? null;
  } catch { return null; }
}
const fail = (error: string, status: number) => Response.json({ error }, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = authorizeRequest(request, { role: 'founder' });
  if ('response' in access) return access.response;
  const id = z.string().uuid().safeParse((await context.params).id);
  if (!id.success) return fail('Invalid feedback ID.', 400);
  const connection = connectAdminDb({ statementTimeoutMs: 8000 });
  let path: string | null = null;
  try {
    const [row] = await connection.db.execute(sql`SELECT screenshot_path FROM public.user_feedback WHERE id = ${id.data}::uuid`);
    path = row?.screenshot_path == null ? null : String(row.screenshot_path);
  } catch { return fail('Feedback could not be loaded.', 502); }
  finally { await connection.close(); }
  if (!path) return fail('No screenshot.', 404);
  const store = await bucket();
  if (!store) return fail('Screenshot storage is not bound to this Worker.', 503);
  try {
    const object = await store.get(path);
    if (!object) return fail('Screenshot not found in storage.', 404);
    const type = object.httpMetadata?.contentType ?? '';
    // Never let the browser sniff an uploaded object into something else.
    return new Response(object.body, { headers: {
      'Content-Type': IMAGE_TYPES.has(type) ? type : 'application/octet-stream',
      ...(IMAGE_TYPES.has(type) ? {} : { 'Content-Disposition': 'attachment' }),
      'Content-Length': String(object.size), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    } });
  } catch { return fail('Screenshot could not be read.', 502); }
}
