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

/** The K on a solid ink tile, used wherever the product is named. */
export function KalloTile() {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-foreground text-background">
      <KalloMark className="h-3.5 w-auto" />
    </span>
  );
}

export function isActive(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
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
      <p className="px-2 pb-2 text-xs text-muted-foreground">{label}</p>
      <div className="grid gap-0.5">
        {items.map((item) => {
          const active = isActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--console-blue)]",
                active
                  ? "bg-card font-medium text-foreground shadow-[var(--shadow-raised)]"
                  : "text-muted-foreground hover:bg-[var(--sidebar-accent)] hover:text-foreground",
              )}
            >
              <item.icon weight="fill" className={cn("size-4 shrink-0", active ? "text-foreground" : "text-muted-foreground")} />
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
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-[var(--sidebar-border)] bg-sidebar lg:flex">
      <div className="flex h-14 items-center gap-2 px-4">
        <KalloTile />
        <div className="min-w-0 leading-tight">
          <p className="text-sm font-medium text-foreground">Kallo admin</p>
          <p className="truncate text-xs text-muted-foreground">Production</p>
        </div>
      </div>
      <nav className="grid flex-1 content-start gap-6 overflow-y-auto px-2 pt-4 pb-6" aria-label="Primary navigation">
        <NavSection label="Run" items={NAV.run} pathname={pathname} />
        <NavSection label="AI" items={NAV.ai} pathname={pathname} />
        <NavSection label="Infrastructure" items={NAV.infra} pathname={pathname} />
      </nav>
    </aside>
  );
}
