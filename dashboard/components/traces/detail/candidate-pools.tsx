import type { MatchingRow } from '@/lib/traces-ui/matching';

/** What retrieval offered for each ingredient, best first; the chosen candidate is marked. Call 2 can still reject it. */
export function CandidatePools({ rows }: { rows: MatchingRow[] }) {
  const withPools = rows.filter(r => r.pool.length);
  if (!withPools.length) return null;
  return <div className="mt-4 grid gap-1"><p className="text-muted-foreground">Candidate pools</p>{withPools.map((r, i) =>
    <details key={i} className="border-t border-border py-1">
      <summary className="cursor-pointer py-1">{r.ingredient} <span className="text-muted-foreground">· {r.pool.length} candidate{r.pool.length === 1 ? '' : 's'}</span></summary>
      <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-muted-foreground"><tr>{['#', 'Food', 'Source', 'State', 'Match', 'Confidence', 'Score'].map(h => <th key={h} className="px-2 py-1 font-normal">{h}</th>)}</tr></thead>
        <tbody>{r.pool.map(c => <tr key={c.rank} className={`border-t border-border ${c.chosen ? 'bg-secondary' : ''}`}>
          <td className="tabular px-2 py-1">{c.rank}{c.chosen && <span className="sr-only"> (chosen)</span>}</td>
          <td className="px-2 py-1"><span className={c.chosen ? 'mark-good' : ''}>{c.food ?? '—'}</span>{c.foodEn && c.foodEn !== c.food && <span className="block text-muted-foreground">{c.foodEn}</span>}</td>
          <td className="px-2 py-1">{c.source ?? '—'}</td><td className="px-2 py-1">{c.state ?? '—'}</td><td className="px-2 py-1">{c.matchType ?? '—'}</td>
          <td className="px-2 py-1">{c.confidence ?? '—'}</td><td className="tabular px-2 py-1">{c.similarity == null ? '—' : c.similarity.toFixed(3)}</td>
        </tr>)}</tbody></table></div>
    </details>)}</div>;
}
