"use client";
import { apiFetch } from '@/lib/api-fetch';

import * as React from "react";
import Link from "next/link";
import { List, MagnifyingGlass, SignOut } from "@phosphor-icons/react/ssr";
import { usePathname, useRouter } from "next/navigation";
import { CommandPalette, MobileNav, useCommandPalette } from "@/components/shell/command-palette";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { NAV } from "@/components/shell/nav-items";
import { isActive, Wordmark } from "@/components/shell/sidebar";
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
  // The links prefetch once the page has loaded, not during it: ten route
  // renders at load share the Worker isolate with this page's own requests.
  const router = useRouter();
  React.useEffect(() => {
    if (!enabled) return;
    const later = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 1));
    const timer = window.setTimeout(() => later(() => Object.values(NAV).flat().forEach(item => router.prefetch(item.href))), 3000);
    return () => window.clearTimeout(timer);
  }, [enabled, router]);

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
      <header className="sticky top-0 z-20 flex h-[60px] items-center gap-6 border-b border-border bg-background px-4 lg:px-7">
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          aria-label="Open navigation"
          className="-ml-2 grid size-8 shrink-0 place-items-center rounded-[5px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--console-accent)] lg:hidden"
        >
          <List className="size-4" />
        </button>
        <Link href="/" prefetch={false} aria-label="Kallo admin home" className="shrink-0 rounded-[5px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--console-accent)]"><Wordmark /></Link>
        <nav aria-label="Primary navigation" className="hidden h-full items-stretch lg:flex">
          {[NAV.run, NAV.ai, NAV.infra].map((group, g) => (
            <div key={g} className="relative flex items-stretch gap-6 px-6 first:pl-0 before:absolute before:top-1/2 before:left-0 before:h-5 before:w-px before:-translate-y-1/2 before:bg-[var(--console-rule-strong)] first:before:hidden">
              {group.map((item) => {
                const active = isActive(item.href, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex h-full items-center text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--console-accent)]",
                      active ? "text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-[var(--console-accent)]" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-4">
          {(pathname === "/" || pathname === "/system") && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground" title={health.detail}>
              <span className={cn("size-1.5 rounded-full", health.state === "live" ? "bg-[var(--console-green)]" : health.state === "down" ? "bg-[var(--console-brick)]" : "bg-[var(--console-amber)]")} />
              <span className="hidden md:inline">{health.state === "live" ? "Live" : health.state === "down" ? "Unavailable" : "Checking"}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-8 items-center gap-2 rounded-[5px] text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--console-accent)]"
          >
            <MagnifyingGlass className="size-4 shrink-0" />
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden h-5 items-center rounded-[3px] border border-[var(--console-rule-strong)] px-1.5 font-sans text-xs text-[var(--console-faint)] sm:inline-flex">⌘K</kbd>
          </button>
          <ThemeToggle />
          <span className="hidden text-xs text-muted-foreground sm:inline" title={auth.expiresAt ? `Session expires ${new Date(auth.expiresAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}` : undefined}>{auth.error ? "Session unavailable" : auth.loading ? "Checking access" : auth.role === "founder" ? "Founder" : auth.role === "reviewer" ? "Reviewer" : "No session"}</span>
          {auth.role ? <button type="button" onClick={() => void logout()} className="-mr-2 grid size-8 place-items-center rounded-[5px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--console-accent)]" aria-label="Log out" title="Log out"><SignOut className="size-4" /></button> : null}
        </div>
      </header>
      <CommandPalette open={open} onClose={() => setOpen(false)} />
      <MobileNav open={navOpen} onClose={() => setNavOpen(false)} pathname={pathname} />
    </>
  );
}
