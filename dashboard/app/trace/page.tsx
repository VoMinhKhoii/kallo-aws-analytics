import { redirect } from "next/navigation";
import { TraceExplorer } from "@/components/console/trace-explorer";

export const dynamic = "force-dynamic";

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function TracePage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string | string[] }>;
}) {
  const params = await searchParams;
  const requested = Array.isArray(params.request) ? params.request[0] : params.request;
  if (requested && REQUEST_ID.test(requested)) redirect(`/trace/${requested}`);

  return <TraceExplorer />;
}
