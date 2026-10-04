import 'server-only';
import { createSign } from 'node:crypto';
import type { CloudMonitoringResponse, CloudRunSystemPoint } from '@/app/lib/types';
let cachedToken: { value: string; expires: number } | null = null;
let cachedResult: { key: string; value: CloudMonitoringResponse; expires: number } | null = null;

async function accessToken() {
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.value;
  const credentials = JSON.parse(process.env.GOOGLE_MONITORING_CREDENTIALS || '{}') as { client_email?: string; private_key?: string };
  if (!credentials.client_email || !credentials.private_key) throw new Error('Google Monitoring reader is not configured.');
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const claims = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode({ iss: credentials.client_email, scope: 'https://www.googleapis.com/auth/monitoring.read', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const signature = createSign('RSA-SHA256').update(claims).sign(credentials.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: claims + '.' + signature }) });
  const body = await r.json() as { access_token?: string };
  if (!r.ok || !body.access_token) throw new Error('Google rejected the Monitoring reader credentials.');
  cachedToken = { value: body.access_token, expires: Date.now() + 3300 * 1000 };
  return body.access_token;
}
interface GoogleSeries { metric?: { labels?: Record<string,string> }; points?: { interval: { endTime: string }; value: { doubleValue?: number; int64Value?: string } }[] }

export async function getDirectMonitoring(from: string, to: string, refresh = false): Promise<CloudMonitoringResponse> {
  const key = from + ':' + to;
  if (!refresh && cachedResult?.key === key && cachedResult.expires > Date.now()) return cachedResult.value;
  const token = await accessToken();
  const project = process.env.GCP_PROJECT_ID || 'cal-487315';
  const service = process.env.GCP_CLOUD_RUN_SERVICE || 'kallo-prod';
  const location = process.env.GCP_CLOUD_RUN_LOCATION || 'asia-southeast1';
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  const alignment = days <= 7 ? 3600 : days <= 30 ? 21600 : 86400;
  const end = new Date(Math.min(Date.parse(to) + 86400000, Date.now())).toISOString();
  const rows = new Map<string, CloudRunSystemPoint>();
  async function collect(field: keyof CloudRunSystemPoint, metric: string, aligner: string, reducer: string, count = false) {
    const params = new URLSearchParams({ filter: `metric.type = "${metric}" AND resource.type = "cloud_run_revision" AND resource.labels.service_name = "${service}" AND resource.labels.location = "${location}"`, 'interval.startTime': from + 'T00:00:00Z', 'interval.endTime': end, view: 'FULL', 'aggregation.alignmentPeriod': alignment + 's', 'aggregation.perSeriesAligner': aligner, 'aggregation.crossSeriesReducer': reducer, pageSize: '10000' });
    if (count) params.append('aggregation.groupByFields', 'metric.labels.response_code_class');
    do {
      const r = await fetch(`https://monitoring.googleapis.com/v3/projects/${project}/timeSeries?${params}`, { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
      if (!r.ok) throw new Error('Google Monitoring could not read ' + field + '.');
      const body = await r.json() as { timeSeries?: GoogleSeries[]; nextPageToken?: string };
      for (const series of body.timeSeries || []) for (const point of series.points || []) {
        const timestamp = point.interval.endTime;
        const row = rows.get(timestamp) || { timestamp };
        const value = Number(point.value.doubleValue ?? point.value.int64Value ?? 0);
        if (count) { row.request_count = (row.request_count || 0) + value; if (series.metric?.labels?.response_code_class?.startsWith('5')) row.error_count = (row.error_count || 0) + value; }
        else Object.assign(row, { [field]: value });
        rows.set(timestamp, row);
      }
      if (!body.nextPageToken) break;
      params.set('pageToken', body.nextPageToken);
    } while (true);
  }
  await Promise.all([
    ...[50,95,99].map(n => collect(`p${n}_ms` as keyof CloudRunSystemPoint,'run.googleapis.com/request_latencies','ALIGN_SUM',`REDUCE_PERCENTILE_${n}`)),
    collect('request_count','run.googleapis.com/request_count','ALIGN_SUM','REDUCE_SUM',true),
    collect('startup_p95_ms','run.googleapis.com/container/startup_latencies','ALIGN_SUM','REDUCE_PERCENTILE_95'),
    collect('cpu_p95','run.googleapis.com/container/cpu/utilizations','ALIGN_SUM','REDUCE_PERCENTILE_95'),
    collect('memory_p95','run.googleapis.com/container/memory/utilizations','ALIGN_SUM','REDUCE_PERCENTILE_95'),
    collect('instances','run.googleapis.com/container/instance_count','ALIGN_MEAN','REDUCE_SUM'),
  ]);
  const value: CloudMonitoringResponse = { source: 'google-cloud-monitoring', delivery_source: 'cloudflare-direct', project, service, location, from, to, alignment_seconds: alignment, collected_at: new Date().toISOString(), series: [...rows.values()].sort((a,b) => a.timestamp.localeCompare(b.timestamp)).map(row => ({ ...row, error_count: row.error_count || 0, error_rate: row.request_count ? (row.error_count || 0) / row.request_count : 0 })) };
  cachedResult = { key, value, expires: Date.now() + 300000 };
  return value;
}
