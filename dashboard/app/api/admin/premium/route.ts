import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { authorizeRequest } from '@/lib/auth';
import { connectAdminDb } from '@/lib/admin/db/client';
import { getOperator } from '@/lib/admin/operator';
import { getOverview, listEndingSoon } from '@/lib/admin/premium/accounts/overview';
import { searchAccounts } from '@/lib/admin/premium/accounts/search';
import { getAccount } from '@/lib/admin/premium/accounts/lookup';
import { getWelcomeOffer, saveWelcomeOffer } from '@/lib/admin/premium/offer/offer';
import { offerInputSchema } from '@/lib/admin/premium/offer/offer-input';
import { listActivity } from '@/lib/admin/premium/activity/list-activity';
import { undoAction } from '@/lib/admin/premium/activity/undo';
import { whoSchema } from '@/lib/admin/premium/targets/who-input';
import { countWho } from '@/lib/admin/premium/targets/count-who';
import { giveInputSchema, endInputSchema } from '@/lib/admin/premium/grants/grant-input';
import { givePremium } from '@/lib/admin/premium/grants/give';
import { endFreePremium } from '@/lib/admin/premium/grants/end';

export const dynamic = 'force-dynamic';
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('preview'), input: whoSchema }),
  z.object({ action: z.literal('offer'), input: offerInputSchema }),
  z.object({ action: z.literal('give'), input: giveInputSchema }),
  z.object({ action: z.literal('end'), input: endInputSchema }),
  z.object({ action: z.literal('undo'), input: z.object({ id: z.string().uuid(), reason: z.string().trim().min(3).max(300) }) }),
]);

export async function GET(request: Request) {
  const access = authorizeRequest(request, { role: 'founder' });
  if ('response' in access) return access.response;
  const connection = connectAdminDb();
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('search');
    if (query !== null) {
      const term = z.string().trim().min(2).max(100).parse(query);
      return json(await searchAccounts(connection.db, term));
    }
    const id = url.searchParams.get('account');
    if (id) return json(await getAccount(connection.db, z.string().uuid().parse(id)));
    const [schema] = await connection.db.execute(sql`SELECT to_regclass('public.premium_settings')::text AS settings, to_regclass('public.premium_grant_audit')::text AS audit`);
    if (!schema.settings || !schema.audit) return json({ error: 'The Premium migrations from Kallo PRs #414–415 have not been applied to the production database.', code: 'MIGRATIONS_REQUIRED' }, 503);
    const overview = await getOverview(connection.db);
    const offer = await getWelcomeOffer(connection.db);
    const activity = await listActivity(connection.db);
    const ending = await listEndingSoon(connection.db);
    return json({ overview, offer, activity, ending });
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: error.issues[0].message }, 400);
    console.error('[admin/premium] Read failed');
    return json({ error: 'Premium data could not be loaded. Try refreshing.' }, 502);
  } finally { await connection.close(); }
}

export async function POST(request: Request) {
  const access = authorizeRequest(request, { role: 'founder', sameOrigin: true });
  if ('response' in access) return access.response;
  if (Number(request.headers.get('content-length')) > 65536) return json({ error: 'Request too large.' }, 413);
  const text = await request.text();
  if (text.length > 65536) return json({ error: 'Request too large.' }, 413);
  let parsed: z.output<typeof actionSchema>;
  try { parsed = actionSchema.parse(JSON.parse(text)); }
  catch (error) { return json({ error: error instanceof z.ZodError ? error.issues[0].message : 'Invalid request.' }, 400); }
  const connection = connectAdminDb();
  try {
    const db = connection.db;
    if (parsed.action === 'preview') return json(await countWho(db, parsed.input));
    const operator = await getOperator(db);
    switch (parsed.action) {
      case 'give': return json(await givePremium(operator, parsed.input, { db }));
      case 'end': return json(await endFreePremium(operator, parsed.input, { db }));
      case 'offer': await saveWelcomeOffer(operator, parsed.input, { db }); return json({ ok: true });
      case 'undo': return json(await undoAction(operator, parsed.input.id, parsed.input.reason, { db }));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const safe = /^(Pick a date|That action|Nothing to restore)/.test(message);
    console.error('[admin/premium] Action failed');
    return json({ error: safe ? message : 'The action could not be completed. Refresh and try again.' }, safe ? 400 : 502);
  } finally { await connection.close(); }
}
