"use client";
import { TextTabs } from './text-tabs';
/** Single-choice filter, drawn as text tabs. */
export function FilterChips({ value, onChange, items, label = "Status filter" }: {value:string; onChange:(v:string)=>void; items:{value:string;label:string}[]; label?: string}) {
  return <TextTabs value={value} onChange={onChange} items={items} label={label} />;
}
