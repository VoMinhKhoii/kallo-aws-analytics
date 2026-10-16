"use client";
import { RefreshButton } from '@/components/console/console';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
export function PageHeader({ title, window, onWindow, refreshing, onRefresh }: { title: string; window?: string; onWindow?: (w: string) => void; refreshing?: boolean; onRefresh?: () => void }) {
  return <header className="flex flex-wrap items-center justify-between gap-3 pb-2"><h1 className="text-[22px] font-semibold tracking-tight">{title}</h1><div className="flex flex-wrap items-center gap-2">{onWindow && <ToggleGroup type="single" value={window} onValueChange={v => v && onWindow(v)} aria-label="Window">{['24h', '7d', '30d'].map(w => <ToggleGroupItem key={w} value={w} className="tabular px-3">{w}</ToggleGroupItem>)}</ToggleGroup>}{onRefresh && <RefreshButton refreshing={!!refreshing} onClick={onRefresh} />}</div></header>;
}
