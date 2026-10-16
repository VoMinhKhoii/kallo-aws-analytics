/** Shared rolling bounds and hourly bucket origins, all in UTC. */
export const WINDOWS = ['24h', '7d', '30d'] as const;
export type Window = typeof WINDOWS[number];
export function validChoice<T extends string>(raw: string | null, fallback: T, choices?: readonly T[]): T {
  return raw && (!choices || choices.includes(raw as T)) ? raw as T : fallback;
}
/** UTC hour containing an instant, independent of the host timezone. */
export function floorHour(instant: string): string {
  return new Date(Math.floor(Date.parse(instant) / 3600000) * 3600000).toISOString();
}
/** 24 complete hourly bucket origins plus the current hour. */
export function hourRange(to: string, hours = 24): string[] {
  const end = Date.parse(floorHour(to));
  return Array.from({length: hours + 1}, (_, i) => new Date(end - (hours - i) * 3600000).toISOString());
}
export function rangeWindow(range: Window, now = new Date()) {
  const days = range === '24h' ? 1 : Number(range.slice(0, -1));
  if (range === '24h') return {from: new Date(now.getTime() - 86400000).toISOString(), to: now.toISOString(), days};
  const to = now.toISOString().slice(0, 10);
  return {from: new Date(Date.parse(to) - (days - 1) * 86400000).toISOString().slice(0, 10), to, days};
}
export function validMetricRange(from: string | null, to: string | null, maxDays = 61): boolean {
  if (!from || !to) return false;
  const date = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
  const instant = (v: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
  const span = Date.parse(to) - Date.parse(from);
  return (date(from) && date(to) && span >= 0 && span < maxDays * 86400000) ||
    (instant(from) && instant(to) && span > 0 && span <= 48 * 3600000);
}
