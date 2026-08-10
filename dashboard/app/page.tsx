import { Dashboard } from "@/app/components/dashboard";
import { getDashboardMetrics } from "@/app/lib/api";

export const dynamic = "force-dynamic";

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function Page() {
  const toDate = new Date();
  const fromDate = new Date(toDate);
  fromDate.setUTCDate(fromDate.getUTCDate() - 89);
  const from = isoDate(fromDate);
  const to = isoDate(toDate);
  const { data, errors } = await getDashboardMetrics(from, to);

  return <Dashboard metrics={data} errors={errors} from={from} to={to} mockMode={process.env.MOCK_API === "1"} />;
}
