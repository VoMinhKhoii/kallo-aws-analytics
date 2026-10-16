/** Bounded isolate-local aggregate cache. Failed loads are never cached. */
export class AggregateCache {
  private entries = new Map<string, { value?: unknown; expires: number; refreshed: number; collectedAt?: string; pending?: Promise<{ value: unknown; collectedAt: string }> }>();
  constructor(private max = 200, private now = Date.now) {}
  async get<T>(key: string, ttl: number, load: () => Promise<T>, refresh = false): Promise<{ value: T; collectedAt: string }> {
    const now = this.now();
    let entry = this.entries.get(key);
    if (entry?.pending) return entry.pending as Promise<{ value: T; collectedAt: string }>;
    if (entry?.value !== undefined && entry.expires > now && !refresh) {
      this.entries.delete(key); this.entries.set(key, entry);
      return { value: entry.value as T, collectedAt: entry.collectedAt! };
    }
    if (!entry) {
      if (this.entries.size >= this.max) {
        const victim = [...this.entries].find(([, e]) => !e.pending)?.[0];
        if (victim !== undefined) this.entries.delete(victim);
        else throw new Error('Aggregate cache is busy.');
      }
      entry = { expires: 0, refreshed: -Infinity };
      this.entries.set(key, entry);
    }
    this.entries.delete(key); this.entries.set(key, entry);
    const current = entry;
    current.refreshed = now;
    current.pending = Promise.resolve().then(load).then(value => {
      const collectedAt = new Date(this.now()).toISOString();
      Object.assign(current, { value, collectedAt, expires: this.now() + ttl });
      return { value, collectedAt };
    }).finally(() => { delete current.pending; if (current.value === undefined) this.entries.delete(key); });
    return current.pending as Promise<{ value: T; collectedAt: string }>;
  }
}
export const aggregateCache = new AggregateCache();
export function windowTtl(from: string, to: string, now = Date.now()): number {
  const today = new Date(now).toISOString().slice(0, 10);
  return from <= today && to >= today ? 60000 : 900000;
}
