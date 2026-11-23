'use client';
import { useEffect, useState } from 'react';
import { int } from '@/lib/ai-usage/format';
import { useResource } from '@/lib/traces-ui/use-resource';
import { useSessionRole } from '@/lib/use-auth';
import { useUrlState } from '@/lib/use-url-state';
import { PageHeader } from '@/components/shared/page-header';
import { PageSkeleton } from '@/components/shared/page-skeleton';
import { MetricSection } from '@/components/shared/metric-section';
import { date, field } from '@/components/admin/premium/shared';
import type { PromptSummary, PromptVersion } from '@/lib/prompts/catalog';
import { VersionDiff } from './version-diff';

const short = (v: string | null) => v ? v.slice(0, 8) : '—';

/** The prompt versions Kallo registered, and what changed between any two. */
export default function PromptsPage() {
  const auth = useSessionRole();
  const list = useResource<{ prompts: PromptSummary[] }>(auth.role === 'founder' ? '/api/admin/prompts' : null);
  const [name, setName] = useUrlState('prompt', '');
  const history = useResource<{ versions: PromptVersion[] }>(auth.role === 'founder' && name ? `/api/admin/prompts?name=${encodeURIComponent(name)}` : null);
  const versions = history.data?.versions ?? [];
  // Default comparison: the newest version against the one before it.
  const [pair, setPair] = useState<[string, string]>(['', '']);
  useEffect(() => { setPair([versions[1]?.id ?? versions[0]?.id ?? '', versions[0]?.id ?? '']); }, [history.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const before = versions.find(v => v.id === pair[0]), after = versions.find(v => v.id === pair[1]);
  if (auth.loading || (list.loading && !list.data)) return <PageSkeleton title="Prompts" cells={0} charts={0} rows />;
  if (auth.role !== 'founder') return <div className="grid gap-6"><PageHeader title="Prompts" /><p className="text-sm text-muted-foreground">Prompt history requires founder access.</p></div>;
  const prompts = list.data?.prompts ?? [];
  const option = (v: PromptVersion) => `${date(v.firstSeenAt)} · ${short(v.codeHash)}${v.gitSha ? ` · ${short(v.gitSha)}` : ''}`;
  return <div className="grid gap-6">
    <PageHeader title="Prompts" refreshing={list.loading || history.loading} onRefresh={() => { list.refresh(); history.refresh(); }} />
    <div className="grid items-start gap-x-10 gap-y-6 lg:grid-cols-3">
      <MetricSection title="Catalog" error={list.error} retry={list.refresh} empty={!prompts.length}>
        <div className="divide-y divide-border border-y border-border">{prompts.map(p =>
          <button key={p.name} type="button" aria-pressed={p.name === name} onClick={() => setName(p.name)} className={`grid w-full gap-1 border-l-2 py-3 pl-3 text-left transition-colors hover:bg-secondary ${p.name === name ? 'border-[var(--console-accent)] bg-secondary' : 'border-transparent'}`}>
            <span className="truncate text-sm">{p.name}</span>
            <span className="text-xs text-muted-foreground">{int(p.versions)} version{p.versions === 1 ? '' : 's'} · latest {date(p.latestSeenAt)}</span>
          </button>)}</div>
      </MetricSection>
      <div className="min-w-0 lg:col-span-2">
        <MetricSection title={name || 'Pick a prompt'} loading={!!name && history.loading && !history.data} error={history.error} retry={history.refresh} empty={!name} emptyLabel="Choose a prompt from the catalog to see its versions.">
          {versions.length > 0 && <div className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-2">{(['From', 'To'] as const).map((label, side) =>
              <label key={label} className="grid gap-2 text-sm text-muted-foreground">{label}
                <select className={field} value={pair[side]} onChange={e => setPair(p => side ? [p[0], e.target.value] : [e.target.value, p[1]])}>{versions.map(v => <option key={v.id} value={v.id}>{option(v)}</option>)}</select>
              </label>)}</div>
            {after && <p className="text-sm text-muted-foreground">Model {after.model} · code hash <span className="font-mono">{short(after.codeHash)}</span> · git <span className="font-mono">{short(after.gitSha)}</span></p>}
            {before && after && (before.id === after.id ? <pre className="max-h-[640px] overflow-auto whitespace-pre-wrap rounded-[5px] bg-[var(--console-surface)] px-4 py-3 text-[13px] leading-6">{after.templateSample}</pre> : <VersionDiff before={before.templateSample} after={after.templateSample} />)}
          </div>}
        </MetricSection>
      </div>
    </div>
  </div>;
}
