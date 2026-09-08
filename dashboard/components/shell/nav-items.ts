import { Activity, Database, FileCode2, Home, Leaf, Search, Sparkles, TrendingUp } from "lucide-react";

export const NAV = {
  observe: [
    { href: "/", label: "Today", icon: Home },
    { href: "/ai", label: "AI", icon: Sparkles },
    { href: "/ingredients", label: "Ingredients", icon: Leaf },
    { href: "/system", label: "System", icon: Activity },
  ],
  diagnose: [
    { href: "/pipeline", label: "Pipeline overview", icon: TrendingUp },
    { href: "/trace", label: "Trace viewer", icon: FileCode2 },
    { href: "/retrieval", label: "Retrieval & matching", icon: Search },
    { href: "/coverage", label: "Coverage & corpus", icon: Database },
  ],
};
export const ALL_NAV = [...NAV.observe, ...NAV.diagnose];
