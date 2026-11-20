import { ChatCircleText, Cpu, Crown, FileText, House, Leaf, ListBullets, Pulse } from '@phosphor-icons/react/ssr';
export const NAV = {
 run: [{href: '/', label: 'Overview', icon: House}, {href: '/premium', label: 'Premium', icon: Crown}, {href: '/feedback', label: 'Feedback', icon: ChatCircleText}],
 ai: [{href: '/traces', label: 'Traces', icon: ListBullets}, {href: '/ai', label: 'AI', icon: Cpu}, {href: '/ingredients', label: 'Ingredients', icon: Leaf}, {href: '/prompts', label: 'Prompts', icon: FileText}],
 infra: [{href: '/system', label: 'System', icon: Pulse}],
};
export const ALL_NAV = [...NAV.run, ...NAV.ai, ...NAV.infra];
