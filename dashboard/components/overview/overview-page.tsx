"use client";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { useUrlState } from '@/lib/use-url-state';
import { Overview } from './overview-content';
export default function OverviewPage() {
  const [win, setWin, ready] = useUrlState('w', '30d', ['7d', '30d', '90d']);
  if (!ready) return <PageSkeleton title="Overview" charts={1} cells={6} />;
  return <Overview key={win} win={win} setWin={setWin} />;
}
