import TraceDetail from '@/components/traces/detail/trace-detail';
export default async function Page({params}:{params:Promise<{id:string}>}) {const {id}=await params;return <TraceDetail id={id}/>;}
