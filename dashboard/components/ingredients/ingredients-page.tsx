"use client";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { useUrlState } from '@/lib/use-url-state';
import { Ingredients } from './ingredients-content';
export default function IngredientsPage() {
  const [win, setWin, ready] = useUrlState('w', '30d', ['7d','30d','90d']);
  const [tab, setTab] = useUrlState('tab', 'matching', ['matching','catalog']);
  if (!ready) return <PageSkeleton title="Ingredients" charts={1} cells={4} />;
  return <Ingredients key={win} win={win} setWin={setWin} tab={tab} setTab={setTab} />;
}
