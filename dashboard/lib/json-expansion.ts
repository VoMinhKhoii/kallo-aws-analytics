export function toggleBranch(open:Set<string>, all:boolean, paths:string[], path:string, expanded:boolean) {
  const next=new Set(all?paths:open);
  if(expanded)next.delete(path);else next.add(path);
  return next;
}
