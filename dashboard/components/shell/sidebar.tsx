"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, TrendingUp, FileCode2, Search, Database, Plus, Play, History } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const PRIMARY = [
  { href: "/", label: "App metrics", icon: Home },
  { href: "/pipeline", label: "Pipeline overview", icon: TrendingUp },
  { href: "/trace", label: "Trace viewer", icon: FileCode2 },
];
const DIAGNOSE = [
  { href: "/retrieval", label: "Retrieval & matching", icon: Search },
  { href: "/coverage", label: "Coverage & corpus", icon: Database },
];
const RUNS = [
  { href: "/pipeline#run", label: "Run now", icon: Play },
  { href: "/pipeline#history", label: "Run history", icon: History },
];

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <aside className="bg-sidebar border-sidebar-border sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r lg:flex">
      <div className="flex h-14 items-center gap-2 px-5">
        <span className="text-base leading-none">✦</span>
        <span className="text-[15px] font-semibold tracking-tight">Kallo analytics</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        <p className="text-muted-foreground px-2 pt-3 pb-1.5 text-[11px]">Home</p>
        {PRIMARY.map((i) => {
          const active = pathname === i.href;
          return (
            <Link
              key={i.href}
              href={i.href}
              className={cn(
                "mb-0.5 flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors",
                active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60"
              )}
            >
              <i.icon className="size-4 shrink-0" />
              <span className="truncate">{i.label}</span>
            </Link>
          );
        })}

        <Separator className="my-3" />
        <p className="text-muted-foreground px-2 pb-1.5 text-[11px]">Diagnose</p>
        {DIAGNOSE.map((i) => {
          const active = pathname === i.href;
          return (
            <Link
              key={i.href}
              href={i.href}
              className={cn(
                "mb-0.5 flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors",
                active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60"
              )}
            >
              <span className="text-muted-foreground w-4 shrink-0 text-center">—</span>
              <span className="truncate">{i.label}</span>
            </Link>
          );
        })}

        <Separator className="my-3" />
        <div className="flex items-center justify-between px-2 pb-1.5">
          <p className="text-muted-foreground text-[11px]">Pipeline</p>
          <button
            disabled
            title="Triggering a run needs the AWS pipeline stack, which is not deployed yet"
            aria-label="New run (unavailable)"
            className="text-muted-foreground/40 grid size-5 cursor-not-allowed place-items-center rounded-md"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        {RUNS.map((i) => (
          <span
            key={i.href}
            title="Needs the AWS pipeline stack, which is not deployed yet"
            className="text-muted-foreground/45 mb-0.5 flex h-9 cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 text-[13px]"
          >
            <span className="w-4 shrink-0 text-center">—</span>
            <span className="truncate">{i.label}</span>
          </span>
        ))}
      </nav>

      <div className="text-muted-foreground border-sidebar-border border-t px-5 py-3 text-[11px] leading-relaxed">
        AWS analytics plane
        <br />
        RMIT Cloud Computing A3
      </div>
    </aside>
  );
}
