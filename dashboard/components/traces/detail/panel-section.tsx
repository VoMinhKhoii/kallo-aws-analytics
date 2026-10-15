import type { ReactNode } from 'react';
export function PanelSection({title,children,open=true}:{title:string;children:ReactNode;open?:boolean}) {return <details open={open} className="border-b border-border"><summary className="sticky top-0 z-10 cursor-pointer bg-card px-4 py-3 text-xs font-medium">{title}</summary><div className="px-4 pb-4 text-xs">{children}</div></details>;}
