'use client';
import { useEffect, useState } from 'react';
import { FilterChips } from '@/components/shared/filter-chips';
import { ActivityList } from './activity-list';
import { api, type Activity } from './shared';

const ACTIONS = ['all', 'grant', 'end', 'offer', 'undo'] as const;
const LABELS: Record<(typeof ACTIONS)[number], string> = { all: 'All', grant: 'Gave', end: 'Ended', offer: 'Welcome offer', undo: 'Undo' };

/** The admin action log; a filter reads the newest 100 actions of that kind from the server. */
export function ActivityTab({ rows, onSaved }: { rows: Activity[]; onSaved: () => void }) {
  const [action, setAction] = useState<(typeof ACTIONS)[number]>('all');
  const [filtered, setFiltered] = useState<{ action: string; rows: Activity[] } | null>(null); const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    setFiltered(null); setError('');
    if (action === 'all') return;
    let live = true;
    api<{ activity: Activity[] }>('?activity=' + action).then(r => { if (live) setFiltered({ action, rows: r.activity }); }).catch(e => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [action, version, rows]);
  return <div className="grid gap-4">
    <FilterChips value={action} onChange={v => setAction(v as typeof action)} items={ACTIONS.map(value => ({ value, label: LABELS[value] }))} />
    {error && <p role="alert" className="text-sm text-foreground mark-bad">{error}</p>}
    {action === 'all' ? <ActivityList rows={rows} onSaved={() => { onSaved(); setVersion(v => v + 1); }} /> : error ? null : filtered?.action !== action ? <p className="text-sm text-muted-foreground">Loading…</p> : <ActivityList rows={filtered.rows} onSaved={() => { onSaved(); setVersion(v => v + 1); }} />}
  </div>;
}
