import { Activity, Home, Leaf, Sparkles, Crown, MessageSquare, List } from 'lucide-react';
export const NAV = {
 run: [{href: '/', label: 'Overview', icon: Home}, {href: '/premium', label: 'Premium', icon: Crown}, {href: '/feedback', label: 'Feedback', icon: MessageSquare}],
 ai: [{href: '/traces', label: 'Traces', icon: List}, {href: '/ai', label: 'AI', icon: Sparkles}, {href: '/ingredients', label: 'Ingredients', icon: Leaf}],
 infra: [{href: '/system', label: 'System', icon: Activity}],
};
export const ALL_NAV = [...NAV.run, ...NAV.ai, ...NAV.infra];
