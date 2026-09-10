import Link from "next/link";
import { notFound } from "next/navigation";
import { ConsolePage } from "@/components/console/console";
import { RequestTraceDetail } from "@/components/console/request-trace-detail";

export const dynamic = "force-dynamic";

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function TraceDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  if (!REQUEST_ID.test(requestId)) notFound();

  return (
    <ConsolePage>
      <nav className="mb-3" aria-label="Trace navigation">
        <Link href="/trace" className="text-xs font-medium text-[var(--console-blue)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--console-blue)]">
          ← All meal traces
        </Link>
      </nav>
      <RequestTraceDetail requestId={requestId} />
    </ConsolePage>
  );
}
