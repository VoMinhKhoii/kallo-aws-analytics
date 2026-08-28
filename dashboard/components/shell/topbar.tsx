"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import { Search, Menu } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useRange, RANGE_KEYS, RANGE_LABEL, type RangeKey } from "@/components/range-context";
import { CommandPalette, MobileNav, useCommandPalette } from "@/components/shell/command-palette";
import { cn } from "@/lib/utils";

type Health = { ok: boolean; reason?: string; authMode?: string } | null;

/** Status is proven by a real query, never inferred from env vars being present. */
function useHealth(): { state: "checking" | "live" | "down"; detail: string } {
  const [h, setH] = React.useState<Health>(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    fetch("/api/analytics", { method: "POST" })
      .then((r) => r.json())
      .then((j) => live && setH(j))
      .catch(() => live && setFailed(true));
    return () => { live = false; };
  }, []);
  if (failed) return { state: "down", detail: "the dashboard server did not respond" };
  if (!h) return { state: "checking", detail: "running a probe query" };
  if (h.ok) return { state: "live", detail: `dev · ${h.authMode ?? "connected"}` };
  return { state: "down", detail: h.reason ?? "the probe query failed" };
}

export function Topbar() {
  const { range, setRange } = useRange();
  const pathname = usePathname();
  const { open, setOpen } = useCommandPalette();
  const [navOpen, setNavOpen] = React.useState(false);
  const health = useHealth();

  return (
    <>
      <header className="bg-background/85 sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4 backdrop-blur lg:px-5">
        <button onClick={() => setNavOpen(true)} aria-label="Open navigation"
                className="hover:bg-accent grid size-8 shrink-0 place-items-center rounded-md lg:hidden">
          <Menu className="size-4" />
        </button>

        <div className="flex flex-1 justify-center">
          <button onClick={() => setOpen(true)}
                  className="bg-secondary/70 text-muted-foreground hover:bg-secondary flex h-8 w-full max-w-sm items-center gap-2 rounded-full border px-3 text-xs transition-colors">
            <Search className="size-3.5" />
            <span className="truncate">Search pages and traces</span>
            <kbd className="bg-card ml-auto rounded border px-1.5 py-0.5 text-[10px]">⌘K</kbd>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <ToggleGroup type="single" value={range} onValueChange={(v) => v && setRange(v as RangeKey)} aria-label="Time range">
            {RANGE_KEYS.map((k) => <ToggleGroupItem key={k} value={k}>{RANGE_LABEL[k]}</ToggleGroupItem>)}
          </ToggleGroup>
          <span className="hidden items-center gap-1.5 xl:flex" title={health.detail}>
            <span className={cn("size-1.5 rounded-full",
              health.state === "live" ? "bg-[var(--chart-1)]"
                : health.state === "down" ? "bg-[var(--chart-3)]" : "bg-[var(--chart-2)]")} />
            <span className="text-muted-foreground text-[11px]">
              {health.state === "live" ? health.detail : health.state === "down" ? "no data" : "checking"}
            </span>
          </span>
        </div>
      </header>

      <CommandPalette open={open} onClose={() => setOpen(false)} />
      <MobileNav open={navOpen} onClose={() => setNavOpen(false)} pathname={pathname} />
    </>
  );
}
