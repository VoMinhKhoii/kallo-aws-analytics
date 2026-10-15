import Link from 'next/link';
export default async function TracesPage({ searchParams }: { searchParams: Promise<{request?: string}> }) {
  const {request} = await searchParams;
  const valid = request && /^[0-9a-f-]{36}$/i.test(request);
  return <div className="mx-auto max-w-[1320px] py-4">
    <h1 className="text-[22px] font-semibold">Traces</h1>
    <p className="my-5 text-sm text-muted-foreground">The new trace viewer is being prepared.</p>
    <Link className="text-sm underline" href={valid ? `/trace/${request}` : '/trace'}>{valid ? 'Open this trace in the current viewer' : 'Open the current trace viewer'}</Link>
  </div>;
}
