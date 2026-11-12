/** Kallo's segmented K, from the app's brand paths (lib/brand/kallo.ts in Kallo). */
export function KalloMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 656 708" className={className} aria-hidden="true" fill="currentColor">
      <path d="M0 0H168V708H0ZM424 0H638L410 277H196ZM196 389H419L656 708H433Z" />
    </svg>
  );
}

/** The K and the product name, as the top bar and sign-in show it. */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <KalloMark className="h-[15px] w-auto text-foreground" />
      <span className="text-[22px] leading-none font-[450] tracking-[-1px]">kallo<span className="text-[var(--console-accent)]">admin</span></span>
    </span>
  );
}

export function isActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
