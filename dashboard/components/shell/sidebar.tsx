"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/components/shell/nav-items";
import { cn } from "@/lib/utils";

/** Kallo's segmented K, from the app's brand paths (lib/brand/kallo.ts in Kallo). */
export function KalloMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 656 708" className={className} aria-hidden="true" fill="currentColor">
      <path d="M0 0H168V708H0ZM424 0H638L410 277H196ZM196 389H419L656 708H433Z" />
    </svg>
  );
}

function NavSection({
  label,
  items,
  pathname,
}: {
  label: string;
  items: typeof NAV.run;
  pathname: string;
}) {
  return (
    <div>
      <p className="px-2.5 pb-1.5 text-[12px] text-[var(--console-muted)]">{label}</p>
      <div className="grid gap-0.5">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex min-h-[34px] items-center gap-2.5 rounded-md px-2.5 text-[14px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--console-blue)]",
                active
                  ? "bg-[var(--console-panel)] font-medium text-[var(--console-ink)]"
                  : "text-[var(--console-muted)] hover:text-[var(--console-ink)]",
              )}
            >
              <item.icon className={cn("size-4 shrink-0", active ? "opacity-100" : "opacity-70 group-hover:opacity-100")} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  if (pathname === "/login") return null;
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-[var(--console-rule)] bg-[var(--console-bg)] lg:flex">
      <div className="flex h-14 items-center gap-2.5 border-b border-[var(--console-rule)] px-5">
        <KalloMark className="h-5 w-auto shrink-0 text-[var(--console-data)]" />
        <div className="min-w-0 leading-tight">
          <p className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--console-ink)]">Kallo admin</p>
          <p className="truncate text-[12px] text-[var(--console-muted)]">admin.kallo.fit · production</p>
        </div>
      </div>
      <nav className="grid flex-1 content-start gap-6 overflow-y-auto px-3 py-5" aria-label="Primary navigation">
        <NavSection label="Run" items={NAV.run} pathname={pathname} />
        <NavSection label="AI" items={NAV.ai} pathname={pathname} />
        <NavSection label="Infrastructure" items={NAV.infra} pathname={pathname} />
      </nav>
    </aside>
  );
}
