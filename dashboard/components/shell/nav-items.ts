import { Activity, FileCode2, Home, Leaf, Sparkles, Crown, MessageSquare, List } from "lucide-react";

export const NAV = {
  observe: [
    { href: "/", label: "Overview", icon: Home },
    { href: "/premium", label: "Premium", icon: Crown },
    { href: "/requests", label: "Requests", icon: List },
    { href: "/feedback", label: "Feedback", icon: MessageSquare },
  ],
  diagnose: [
    { href: "/analytics", label: "Analytics", icon: Activity },
    { href: "/ai", label: "AI", icon: Sparkles },
    { href: "/ingredients", label: "Ingredients", icon: Leaf },
    { href: "/system", label: "System", icon: Activity },
    { href: "/trace", label: "Trace viewer", icon: FileCode2 },
  ],
};
export const ALL_NAV = [...NAV.observe, ...NAV.diagnose];
