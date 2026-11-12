"use client";
/** Single choice shown as plain words; the chosen one is ink with a bronze underline. */
export function TextTabs({ value, onChange, items, label }: { value: string; onChange: (v: string) => void; items: { value: string; label: string }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((i) => (
        <button
          key={i.value}
          type="button"
          aria-pressed={value === i.value}
          onClick={() => onChange(i.value)}
          className="h-7 border-b border-transparent text-xs whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--console-accent)] aria-pressed:border-[var(--console-accent)] aria-pressed:text-foreground"
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}
