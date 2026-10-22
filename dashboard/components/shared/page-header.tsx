"use client";
import { RefreshButton } from '@/components/console/console';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
export function PageHeader({ title, description, window, onWindow, refreshing, onRefresh }: { title: string; description?: string; window?: string; onWindow?: (w: string) => void; refreshing?: boolean; onRefresh?: () => void }) {
  return <header className="flex flex-wrap items-end justify-between gap-4 pb-2"><div className="grid min-w-0 gap-1"><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{description && <p className="text-sm text-muted-foreground">{description}</p>}</div><div className="flex flex-wrap items-center gap-2">{onWindow && <ToggleGroup type="single" value={window} onValueChange={v => v && onWindow(v)} aria-label="Window">{['24h', '7d', '30d'].map(w => <ToggleGroupItem key={w} value={w} className="tabular px-4">{w}</ToggleGroupItem>)}</ToggleGroup>}{onRefresh && <RefreshButton refreshing={!!refreshing} onClick={onRefresh} />}</div></header>;
}
