"use client";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { useUrlState } from '@/lib/use-url-state';
import { System } from './system-content';
export default function SystemPage() {
  const [win, setWin, ready] = useUrlState('w', '7d', ['24h', '7d', '30d']);
  if (!ready) return <PageSkeleton title="System" charts={5} cells={5} />;
  return <System key={win} win={win} setWin={setWin} />;
}
