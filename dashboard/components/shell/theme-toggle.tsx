"use client";
import * as React from "react";
import { Desktop, Moon, Sun } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { THEME_KEY as KEY } from "./theme-script";

type Theme = "light" | "dark" | "system";

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Desktop },
];

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme>("system");

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch {}
  }, []);

  // Follow the OS while on System.
  React.useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const choose = (next: Theme) => {
    setTheme(next);
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {}
    apply(next);
  };

  return (
    <div role="radiogroup" aria-label="Theme" className="flex items-center gap-0.5 rounded-lg bg-[var(--console-surface)] p-0.5">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => choose(value)}
          className={cn(
            "grid size-7 place-items-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-[var(--console-blue)]",
            theme === value ? "bg-card text-foreground shadow-[var(--shadow-raised)]" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon weight="fill" className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
