"use client";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { useUrlState } from '@/lib/use-url-state';
import type { WindowDays } from '@/lib/ai-usage/aggregate';
import { AiUsage } from './ai-content';
export default function AiPage() {
  const [window, setWindow, ready] = useUrlState("w", "30d", ["7d","30d","90d"]);
  const win = Number(window.slice(0,-1)) as WindowDays;
  const setWin = (value: WindowDays) => setWindow(`${value}d`);
  // Remount per window so both bundles load the new range together; a kept
  // bundle would otherwise mix the old range's rows into the new window.
  if (!ready) return <PageSkeleton title="AI" charts={6} cells={5} />;
  return <AiUsage key={win} win={win} setWin={setWin} />;
}

