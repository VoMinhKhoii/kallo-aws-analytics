"use client";
import { RefreshButton } from '@/components/console/console';
import { TextTabs } from './text-tabs';
const WINDOWS = [{ value: '24h', label: '24 hours' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }];
/** Title with the window beside it. No subtitle: what the page shows is in its numbers. */
export function PageHeader({ title, window, onWindow, refreshing, onRefresh }: { title: string; window?: string; onWindow?: (w: string) => void; refreshing?: boolean; onRefresh?: () => void }) {
  return <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 pt-7 pb-1"><div className="flex flex-wrap items-center gap-x-8 gap-y-2"><h1 className="text-2xl leading-8 font-semibold tracking-[-0.5px]">{title}</h1>{onWindow && <div className="pt-1"><TextTabs label="Window" value={window ?? ''} onChange={onWindow} items={WINDOWS} /></div>}</div>{onRefresh && <RefreshButton refreshing={!!refreshing} onClick={onRefresh} />}</header>;
}
