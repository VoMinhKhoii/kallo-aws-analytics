"use client";
import * as React from "react";
import { Moon, Sun } from "@phosphor-icons/react/ssr";
import { THEME_KEY as KEY } from "./theme-script";

const isDark = () => document.documentElement.classList.contains("dark");

/** One button: shows the theme it switches to. Until it is pressed the page follows the OS. */
export function ThemeToggle() {
  const [dark, setDark] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setDark(isDark());
    let stored: string | null = null;
    try { stored = localStorage.getItem(KEY); } catch {}
    if (stored) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { document.documentElement.classList.toggle("dark", media.matches); document.documentElement.style.colorScheme = media.matches ? "dark" : "light"; setDark(media.matches); };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next = !isDark();
    document.documentElement.classList.toggle("dark", next);
    document.documentElement.style.colorScheme = next ? "dark" : "light";
    try { localStorage.setItem(KEY, next ? "dark" : "light"); } catch {}
    setDark(next);
  };

  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button type="button" onClick={toggle} aria-label={label} title={label} className="grid size-8 place-items-center rounded-[5px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--console-accent)]">
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
