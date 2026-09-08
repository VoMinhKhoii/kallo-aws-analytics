"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { NAV } from "@/components/shell/nav-items";
import { cn } from "@/lib/utils";

function NavSection({
  label,
  items,
  pathname,
}: {
  label: string;
  items: typeof NAV.observe;
  pathname: string;
}) {
  return (
    <div>
      <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--console-muted)]">{label}</p>
      <div className="grid gap-0.5">
        {items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={cn(
                "group flex min-h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--console-blue)]",
                active
                  ? "bg-[var(--console-ink)] font-medium text-[var(--console-surface)]"
                  : "text-[var(--console-muted)] hover:bg-[var(--console-surface)] hover:text-[var(--console-ink)]",
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
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-[var(--console-rule)] bg-[var(--console-panel)] lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-[var(--console-rule)] px-5">
        <span className="grid size-6 place-items-center rounded-md bg-[var(--console-ink)] text-xs text-[var(--console-surface)]">K</span>
        <div>
          <p className="text-[14px] font-semibold tracking-[-0.02em] text-[var(--console-ink)]">Kallo analytics</p>
          <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--console-muted)]">Operator console</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-5" aria-label="Primary navigation">
        <NavSection label="Observe" items={NAV.observe} pathname={pathname} />
        <Separator className="my-5 bg-[var(--console-rule)]" />
        <NavSection label="Diagnose" items={NAV.diagnose} pathname={pathname} />
      </nav>
      <div className="border-t border-[var(--console-rule)] px-5 py-4 text-[10px] leading-5 text-[var(--console-muted)]">
        AWS analytics plane
        <br />
        RMIT Cloud Computing A3
      </div>
    </aside>
  );
}
