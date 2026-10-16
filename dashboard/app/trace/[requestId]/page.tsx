import { redirect } from 'next/navigation';
export default async function LegacyTraceDetail({params}:{params:Promise<{requestId:string}>}) {
  const {requestId}=await params;redirect(`/traces/${encodeURIComponent(requestId)}`);
}
