import { Home, TrendingUp, FileCode2, Search, Database } from "lucide-react";

export const NAV = {
  home: [
    { href: "/", label: "App metrics", icon: Home },
    { href: "/pipeline", label: "Pipeline overview", icon: TrendingUp },
    { href: "/trace", label: "Trace viewer", icon: FileCode2 },
  ],
  diagnose: [
    { href: "/retrieval", label: "Retrieval & matching", icon: Search },
    { href: "/coverage", label: "Coverage & corpus", icon: Database },
  ],
};
export const ALL_NAV = [...NAV.home, ...NAV.diagnose];
