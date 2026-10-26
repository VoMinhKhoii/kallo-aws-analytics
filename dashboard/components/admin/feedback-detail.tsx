'use client';
import { useState } from 'react';
import { useResource } from '@/lib/traces-ui/use-resource';
import { date } from './premium/shared';

interface FeedbackRow {
  id: string; user_id: string; email: string | null; type: string; status: string; message: string; platform: string | null; locale: string | null;
  app_version: string | null; route: string | null; metadata: unknown; has_screenshot: boolean; created_at: string; updated_at: string;
}

/** One feedback report in full: who sent it, from where, the screenshot and the metadata the app attached. */
export function FeedbackDetail({ id }: { id: string }) {
  const { data, error, loading, refresh } = useResource<{ row: FeedbackRow }>(`/api/admin/records?kind=feedback&id=${id}`);
  const [broken, setBroken] = useState(false);
  if (loading && !data) return <p className="mt-4 text-xs text-muted-foreground">Loading details…</p>;
  if (error || !data) return <p role="alert" className="mt-4 text-sm text-foreground mark-bad">{error ?? 'Details could not be loaded.'} <button className="underline" onClick={refresh}>Retry</button></p>;
  const r = data.row;
  const fields: [string, string | null][] = [['User', r.email], ['User ID', r.user_id], ['Platform', r.platform], ['App version', r.app_version], ['Locale', r.locale], ['Route', r.route], ['Created', date(r.created_at)], ['Updated', date(r.updated_at)]];
  return <section className="mt-6 grid gap-6 border-t border-[var(--console-rule)] pt-4">
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">{fields.map(([label, value]) => <div key={label} className="grid min-w-0 gap-1"><dt className="text-xs text-muted-foreground">{label}</dt><dd className={`break-all text-sm ${label === 'User ID' ? 'font-mono text-xs' : ''}`}>{value ?? '—'}</dd></div>)}</dl>
    {r.has_screenshot && <figure className="grid gap-2"><figcaption className="text-xs text-muted-foreground">Screenshot</figcaption>
      {broken ? <p className="text-sm text-muted-foreground">The screenshot could not be loaded from storage.</p>
        // eslint-disable-next-line @next/next/no-img-element -- a private, uncached image streamed by our own route; next/image would cache it.
        : <img src={`/api/admin/feedback/${r.id}/screenshot`} alt="Screenshot attached to this feedback" onError={() => setBroken(true)} className="max-h-[480px] w-auto max-w-full justify-self-start rounded-md border border-[var(--console-rule)]" />}
    </figure>}
    {r.metadata != null && <div className="grid gap-2"><p className="text-xs text-muted-foreground">Metadata</p><pre className="overflow-x-auto rounded-md border border-[var(--console-rule)] bg-[var(--console-surface)] px-4 py-2 text-xs">{JSON.stringify(r.metadata, null, 2)}</pre></div>}
  </section>;
}
