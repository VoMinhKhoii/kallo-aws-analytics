"use client";
import { apiFetch } from '@/lib/api-fetch';

import * as React from "react";
import { LogOut, Menu, Search, ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import { CommandPalette, MobileNav, useCommandPalette } from "@/components/shell/command-palette";
import { cn } from "@/lib/utils";
import { useSessionRole } from "@/lib/use-auth";

type Health = { ok: boolean; reason?: string; authMode?: string } | null;

/** Status is proven by a real database read, never inferred from env vars. */
function useHealth(enabled = true): { state: "checking" | "live" | "down"; detail: string } {
  const [health, setHealth] = React.useState<Health>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!enabled) return;
    let active = true;
    apiFetch("/api/admin/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => active && setHealth(body))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [enabled]);

  if (failed) return { state: "down", detail: "Dashboard status probe did not respond" };
  if (!health) return { state: "checking", detail: "Checking the production database" };
  if (health.ok) return { state: "live", detail: health.authMode ? `Connected via ${health.authMode}` : "Connected" };
  return { state: "down", detail: health.reason ?? "The production database is unavailable" };
}

const TITLES: Record<string, string> = {
  "/": "Overview",
  "/premium": "Premium",
  "/requests": "Requests",
  "/feedback": "Feedback",
  "/analytics": "Analytics",
  "/ai": "AI",
  "/ingredients": "Ingredients",
  "/system": "System",
  "/traces": "Traces",
};

export function Topbar() {
  const pathname = usePathname();
  const enabled = pathname !== "/login";
  const { open, setOpen } = useCommandPalette();
  const [navOpen, setNavOpen] = React.useState(false);
  const health = useHealth(pathname === "/" || pathname === "/system");
  const auth = useSessionRole(enabled);
  const title = (pathname.startsWith("/traces/") ? `Traces / ${pathname.split("/")[2].slice(0,8)}` : TITLES[pathname]) ?? "Kallo admin";

  if (!enabled) return null;

  const logout = async () => {
    try {
      const response = await apiFetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      if (response.ok) window.location.assign("/login");
    } catch {
      // A failed best-effort logout leaves the server session untouched; do
      // not claim success or expose transport details in the shell.
    }
  };

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[var(--console-rule)] bg-[var(--console-bg)] px-4 lg:px-7">
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          aria-label="Open navigation"
          className="grid size-8 shrink-0 place-items-center rounded-md text-[var(--console-muted)] hover:bg-[var(--console-surface)] hover:text-[var(--console-ink)] focus-visible:outline-2 focus-visible:outline-[var(--console-blue)] lg:hidden"
        >
          <Menu className="size-4" />
        </button>
        <div className="hidden min-w-0 items-center text-[13px] text-[var(--console-muted)] sm:flex">
          <span className="truncate">{title}</span>
        </div>
        <div className="flex min-w-0 flex-1 justify-center">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-8 w-full max-w-sm items-center gap-2 rounded-md border border-[var(--console-rule)] bg-[var(--console-surface)] px-3 text-left text-xs text-[var(--console-muted)] transition-colors hover:border-[var(--console-ink)] hover:text-[var(--console-ink)] focus-visible:outline-2 focus-visible:outline-[var(--console-blue)]"
          >
            <Search className="size-3.5" />
            <span className="truncate">Search pages and traces</span>
            <kbd className="ml-auto hidden rounded border border-[var(--console-rule)] bg-[var(--console-panel)] px-1.5 py-0.5 text-[11px] sm:inline">⌘K</kbd>
          </button>
        </div>
        {(pathname === "/" || pathname === "/system") && <div className="flex shrink-0 items-center gap-2" title={health.detail}>
          <span className={cn("size-2 rounded-full", health.state === "live" ? "bg-[var(--console-green)]" : health.state === "down" ? "bg-[var(--console-brick)]" : "bg-[var(--console-amber)]")} />
          <span className="hidden text-[12px] text-[var(--console-muted)] md:inline">{health.state === "live" ? "Live" : health.state === "down" ? "Unavailable" : "Checking"}</span>
        </div>
        }<div className="flex items-center gap-1.5 border-l border-[var(--console-rule)] pl-3" title={auth.expiresAt ? `Session expires ${new Date(auth.expiresAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}` : undefined}>
          <ShieldCheck className="size-3.5 text-[var(--console-muted)]" aria-hidden="true" />
          <span className="text-[12px] font-medium text-[var(--console-muted)]">{auth.error ? "Session unavailable" : auth.loading ? "Checking access" : auth.role === "founder" ? "Founder" : auth.role === "reviewer" ? "Reviewer" : "No session"}</span>
          {auth.role ? <button type="button" onClick={() => void logout()} className="ml-1 rounded p-1 text-[var(--console-muted)] hover:bg-[var(--console-surface)] hover:text-[var(--console-ink)] focus-visible:outline-2 focus-visible:outline-[var(--console-blue)]" aria-label="Log out"><LogOut className="size-3.5" /></button> : null}
        </div>
      </header>
      <CommandPalette open={open} onClose={() => setOpen(false)} />
      <MobileNav open={navOpen} onClose={() => setNavOpen(false)} pathname={pathname} />
    </>
  );
}
