export function StatusDot({status}:{status:string}) {
  const color=['error','failed'].includes(status)?'brick':['success','completed'].includes(status)?'green':'amber';
  return <span role="img" aria-label={status} title={status} className="inline-block size-1.5 shrink-0 rounded-full" style={{background:`var(--console-${color})`}} />;
}
