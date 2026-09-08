import { Activity, FileCode2, Home, Leaf, Sparkles } from "lucide-react";

export const NAV = {
  observe: [
    { href: "/", label: "Today", icon: Home },
    { href: "/ai", label: "AI", icon: Sparkles },
    { href: "/ingredients", label: "Ingredients", icon: Leaf },
    { href: "/system", label: "System", icon: Activity },
  ],
  diagnose: [
    { href: "/trace", label: "Trace viewer", icon: FileCode2 },
  ],
};
export const ALL_NAV = [...NAV.observe, ...NAV.diagnose];
