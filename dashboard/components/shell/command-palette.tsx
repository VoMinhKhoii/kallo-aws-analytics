"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft } from "lucide-react";
import { ALL_NAV } from "@/components/shell/nav-items";
import { cn } from "@/lib/utils";

export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { if (open) { setQ(""); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
  if (!open) return null;

  const term = q.trim().toLowerCase();
  const pages = ALL_NAV.filter((n) => !term || n.label.toLowerCase().includes(term));
  // Pipeline request ids are UUIDs. Only route complete ids because the
  // trace-detail RPC accepts an exact UUID, not a fuzzy prefix.
  const looksLikeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q.trim());
  const traceHref = `/trace?request=${encodeURIComponent(q.trim())}`;

  const go = (href: string) => { onClose(); router.push(href); };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-[12vh] px-4"
         onClick={onClose} role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="bg-popover w-full max-w-lg overflow-hidden rounded-xl border shadow-lg"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="text-muted-foreground size-4" />
          <input
            ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Jump to a page, or paste a request id"
            className="h-11 flex-1 bg-transparent text-sm outline-none"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              if (looksLikeId) go(traceHref);
              else if (pages[0]) go(pages[0].href);
            }}
          />
          <kbd className="bg-muted text-muted-foreground rounded border px-1.5 py-0.5 text-[10px]">esc</kbd>
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {pages.map((n) => (
            <button key={n.href} onClick={() => go(n.href)}
                    className="hover:bg-accent flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px]">
              <n.icon className="text-muted-foreground size-4" />
              {n.label}
            </button>
          ))}
          {looksLikeId && (
            <button onClick={() => go(traceHref)}
                    className="hover:bg-accent flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px]">
              <CornerDownLeft className="text-muted-foreground size-4" />
              Open request trace <span className="tabular font-medium">{q.trim()}</span>
            </button>
          )}
          {pages.length === 0 && !looksLikeId && (
            <p className="text-muted-foreground px-2.5 py-3 text-xs">
              Nothing matches. Free-text search across traces and ingredients is not implemented yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function MobileNav({ open, onClose, pathname }: { open: boolean; onClose: () => void; pathname: string }) {
  const router = useRouter();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/25 lg:hidden" onClick={onClose} role="dialog" aria-modal="true" aria-label="Navigation">
      <nav className="bg-sidebar h-full w-64 border-r p-3" onClick={(e) => e.stopPropagation()}>
        <p className="px-2 py-3 text-[15px] font-semibold tracking-tight">✦ Kallo analytics</p>
        {ALL_NAV.map((n) => (
          <button key={n.href} onClick={() => { onClose(); router.push(n.href); }}
                  className={cn("mb-0.5 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[13px]",
                                pathname === n.href ? "bg-sidebar-accent font-medium" : "text-muted-foreground")}>
            <n.icon className="size-4" />
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
