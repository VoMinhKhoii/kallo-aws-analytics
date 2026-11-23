'use client';
import { useDeferredValue, useMemo, useState } from 'react';
import type { Locale } from '@/lib/email/brand';
import { renderEmail, type CampaignContent } from '@/lib/email/render';
import { TextTabs } from '@/components/shared/text-tabs';

/** The email as a recipient sees it, rendered by the same code that sends it. */
export function EmailPreview({ content, locale, name, from }: { content: CampaignContent; locale: Locale; name: string; from: string }) {
  const [width, setWidth] = useState<'desktop' | 'mobile'>('desktop');
  const [part, setPart] = useState<'html' | 'text'>('html');
  const deferred = useDeferredValue(content);
  const out = useMemo(() => renderEmail(deferred, { email: 'someone@example.com', name: name || null, locale }, '#unsubscribe', window.location.origin), [deferred, locale, name]);
  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-border px-4 py-1">
      <TextTabs label="Format" value={part} onChange={v => setPart(v as typeof part)} items={[{ value: 'html', label: 'HTML' }, { value: 'text', label: 'Plain text' }]} />
      <TextTabs label="Width" value={width} onChange={v => setWidth(v as typeof width)} items={[{ value: 'desktop', label: 'Desktop' }, { value: 'mobile', label: 'Mobile' }]} />
    </div>
    <div className="grid gap-1 border-b border-border px-4 py-3 text-xs">
      <p className="truncate text-[var(--console-faint)]">From <span className="text-foreground">{from}</span></p>
      <p className="truncate"><span className="font-medium text-foreground">{out.subject || <span className="text-muted-foreground">No subject</span>}</span>{out.preheader && <span className="text-muted-foreground"> — {out.preheader}</span>}</p>
      {out.locale !== locale && <p className="text-[var(--console-amber)]">No {locale === 'vi' ? 'Vietnamese' : 'English'} version yet, so these readers get the English one.</p>}
    </div>
    <div className="min-h-0 flex-1 overflow-auto bg-white">
      {part === 'html'
        ? <iframe title="Email preview" sandbox="" srcDoc={out.html} className="mx-auto block h-full min-h-[640px] border-0 transition-[width]" style={{ width: width === 'desktop' ? '100%' : 375 }} />
        : <pre className="whitespace-pre-wrap p-6 font-mono text-xs leading-relaxed text-[#3d3d3a]">{out.text}</pre>}
    </div>
  </div>;
}
