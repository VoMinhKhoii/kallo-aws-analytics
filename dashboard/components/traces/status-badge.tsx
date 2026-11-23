const TONES: Record<string, { label: string; tone: string }> = {
  success: { label: 'Success', tone: 'var(--console-green)' },
  completed: { label: 'Success', tone: 'var(--console-green)' },
  error: { label: 'Error', tone: 'var(--console-brick)' },
  failed: { label: 'Error', tone: 'var(--console-brick)' },
  pending: { label: 'Running', tone: 'var(--console-amber)' },
  dropped: { label: 'Dropped', tone: 'var(--console-amber)' },
  missing: { label: 'Not recorded', tone: 'var(--console-faint)' },
};

/** Status colour for a node border, minimap dot or badge. */
export const statusTone = (status: string) => (TONES[status] ?? { tone: 'var(--console-amber)' }).tone;

/** A small tinted label with a dot, so status never relies on colour alone. */
export function StatusBadge({ status }: { status: string }) {
  const { label, tone } = TONES[status] ?? { label: status, tone: 'var(--console-amber)' };
  return <span className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-[3px] px-1.5 text-xs whitespace-nowrap" style={{ color: tone, background: `color-mix(in oklab, ${tone} 14%, transparent)` }}>
    <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: tone }} />{label}
  </span>;
}
