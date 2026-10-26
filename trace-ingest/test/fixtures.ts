// Synthetic kallo_trace_v1 lines shaped like Kallo's cloud-trace output.
import type { StoredPart } from '../src/decisions';

export const REQUEST_ID = '6f1c2b8e-3d4a-4b5c-9e7f-0a1b2c3d4e5f';
const envelope = (eventId: string, seq: number, type: string) => ({
  severity: 'INFO', message: 'kallo_trace_v1', kind: 'kallo_trace_v1', requestId: REQUEST_ID, eventId, seq, type,
});

export function line(eventId: string, seq: number, type: string, payload: Record<string, unknown>): string {
  return JSON.stringify({ ...payload, ...envelope(eventId, seq, type), part: 1, parts: 1, truncated: false });
}

/** The same event split into ordered string parts, as Kallo does past 200 KB. */
export function splitLines(eventId: string, seq: number, type: string, payload: Record<string, unknown>, size: number): string[] {
  const json = JSON.stringify(payload);
  const chunks: string[] = [];
  for (let i = 0; i < json.length; i += size) chunks.push(json.slice(i, i + size));
  return chunks.map((chunk, i) =>
    JSON.stringify({ ...envelope(eventId, seq, type), part: i + 1, parts: chunks.length, payload: chunk, truncated: false }),
  );
}

export const info = (id: string, name: string, similarity: number | string, source = 'fao_vn_2007') => ({
  foodCompositionId: id, matchedName: name, source, similarity, confidence: 'high',
});

export const matching = {
  stage: 'matching', index: 1, status: 'success',
  output: [
    { ingredientIndex: 0, candidates: [{ info: info('rice_cooked', 'Cơm  trắng', 0.91) }, { info: info('rice_raw', 'Gạo', 0.7) }] },
    { ingredientIndex: 1, candidates: [{ info: info('egg_fried', 'Trứng chiên', 1) }] },
    { ingredientIndex: 2, candidates: [] },
  ],
};

export const assembly = {
  stage: 'assembly', index: 3, status: 'success',
  output: {
    bridged: {
      verdicts: [
        // Out of order on purpose: gidx follows mealItemIdx, then ingredientIdx.
        { mealItemIdx: 1, ingredientIdx: 0, verdict: 'unmatched', grounded: { ingredientName: 'Nước mắm' } },
        { mealItemIdx: 0, ingredientIdx: 0, verdict: 'accepted', selectedCandidateIdx: 0, grounded: { ingredientName: '  Cơm   Trắng ' } },
        { mealItemIdx: 0, ingredientIdx: 1, verdict: 'rejected', selectedCandidateIdx: 5, rejectReason: 'Low similarity score', grounded: { ingredientName: 'Trứng' } },
        { mealItemIdx: 2, ingredientIdx: 0, verdict: 'skipped', grounded: { ingredientName: 'Đá' } },
      ],
    },
  },
};

export function stored(lines: { line: string; type: string; at?: string }[]): StoredPart[] {
  return lines.map(({ line: body, type, at }) => {
    const e = JSON.parse(body);
    return { event_id: e.eventId, part: e.part, parts: e.parts, type, emitted_at: at ?? '2026-10-25T10:00:00.000Z', body };
  });
}
