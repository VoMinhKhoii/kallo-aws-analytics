'use client';
import { useMemo } from 'react';
import { renderEmail } from '@/lib/email/render';
import { describeAudience } from '@/lib/email/input';
import { TEMPLATES, type Template } from '@/lib/email/snippets';

const THUMB_SCALE = 0.35;

/** Every starting format as a small live render, like a template gallery. */
export function TemplateGallery({ onPick, disabled }: { onPick: (t: Template) => void; disabled?: boolean }) {
  const thumbs = useMemo(() => {
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    return TEMPLATES.map(t => renderEmail(t.content, { email: 'someone@example.com', name: 'Mai', locale: 'en' }, '#', origin).html);
  }, []);
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(224px,1fr))] gap-x-6 gap-y-8">
    {TEMPLATES.map((t, i) => <button key={t.id} type="button" disabled={disabled} onClick={() => onPick(t)} className="group grid content-start gap-3 text-left disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--console-accent)]">
      <span className="relative block h-[260px] overflow-hidden rounded-[5px] border border-border bg-white transition-colors group-hover:border-[var(--console-accent)]">
        <iframe title={`${t.label} preview`} sandbox="" srcDoc={thumbs[i]} tabIndex={-1} aria-hidden className="pointer-events-none absolute top-0 left-1/2 border-0" style={{ width: 640, height: 260 / THUMB_SCALE, transform: `translateX(-50%) scale(${THUMB_SCALE})`, transformOrigin: 'top center' }} />
      </span>
      <span className="grid gap-1">
        <span className="text-sm font-medium">{t.label}</span>
        <span className="text-xs leading-5 text-muted-foreground">{t.description}</span>
        {t.audience && <span className="text-xs text-[var(--console-faint)]">Audience: {describeAudience(t.audience)}</span>}
      </span>
    </button>)}
  </div>;
}
