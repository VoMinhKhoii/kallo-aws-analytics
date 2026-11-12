"use client";
import { apiFetch } from '@/lib/api-fetch';

import * as React from "react";
import { List, MagnifyingGlass, ShieldCheck, SignOut } from "@phosphor-icons/react/ssr";
import { usePathname } from "next/navigation";
import { CommandPalette, MobileNav, useCommandPalette } from "@/components/shell/command-palette";
import { ThemeToggle } from "@/components/shell/theme-toggle";
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

export function Topbar() {
  const pathname = usePathname();
  const enabled = pathname !== "/login";
  const { open, setOpen } = useCommandPalette();
  const [navOpen, setNavOpen] = React.useState(false);
  const health = useHealth(pathname === "/" || pathname === "/system");
  const auth = useSessionRole(enabled);

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
      <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-[var(--console-rule)] bg-[var(--console-bg)] px-4 lg:px-6">
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          aria-label="Open navigation"
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-[var(--console-surface)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--console-blue)] lg:hidden"
        >
          <List className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-8 w-full max-w-xs items-center gap-2 rounded-lg bg-[var(--console-surface)] pr-1 pl-2 text-left text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--console-blue)]"
        >
          <MagnifyingGlass className="size-4 shrink-0" />
          <span className="truncate">Search</span>
          <kbd className="ml-auto hidden h-6 items-center rounded-md border border-[var(--console-rule)] bg-card px-2 font-sans text-xs text-muted-foreground sm:inline-flex">⌘K</kbd>
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-4">
          {(pathname === "/" || pathname === "/system") && (
            <div className="flex items-center gap-2" title={health.detail}>
              <span className={cn("size-2 rounded-full", health.state === "live" ? "bg-[var(--console-green)]" : health.state === "down" ? "bg-[var(--console-brick)]" : "bg-[var(--console-amber)]")} />
              <span className="hidden text-sm text-muted-foreground md:inline">{health.state === "live" ? "Live" : health.state === "down" ? "Unavailable" : "Checking"}</span>
            </div>
          )}
          <ThemeToggle />
          <div className="flex items-center gap-2" title={auth.expiresAt ? `Session expires ${new Date(auth.expiresAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}` : undefined}>
            <ShieldCheck weight="fill" className="size-4 text-[var(--console-quiet)]" aria-hidden="true" />
            <span className="hidden text-sm text-muted-foreground sm:inline">{auth.error ? "Session unavailable" : auth.loading ? "Checking access" : auth.role === "founder" ? "Founder" : auth.role === "reviewer" ? "Reviewer" : "No session"}</span>
            {auth.role ? <button type="button" onClick={() => void logout()} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-[var(--console-surface)] hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--console-blue)]" aria-label="Log out" title="Log out"><SignOut className="size-4" /></button> : null}
          </div>
        </div>
      </header>
      <CommandPalette open={open} onClose={() => setOpen(false)} />
      <MobileNav open={navOpen} onClose={() => setNavOpen(false)} pathname={pathname} />
    </>
  );
}
