import { getLiveMetrics } from '../lib/admin/live-metrics.ts';
import { getDirectMonitoring } from '../lib/admin/cloud-monitoring.ts';
import { METRIC_NAMES } from '../app/lib/types.ts';
import fs from 'node:fs';
for (const line of fs.readFileSync('.env.local','utf8').trim().split('\n')) {
  const at=line.indexOf('='); process.env[line.slice(0,at)]=JSON.parse(line.slice(at+1));
}
const to = new Date().toISOString().slice(0,10); const from = new Date(Date.now()-6*86400000).toISOString().slice(0,10);
const metrics=await getLiveMetrics(METRIC_NAMES,from,to);
console.log('Metrics:',JSON.stringify(Object.fromEntries(Object.entries(metrics.data).map(([k,v])=>[k,v.length])))); console.log('Metric errors:',metrics.errors);
try { const m=await getDirectMonitoring(from,to);console.log('Cloud Monitoring:',m.series.length,'points'); }catch(e){console.log('Cloud Monitoring:',(e as Error).message);process.exitCode=1}
if(Object.keys(metrics.errors).length)process.exitCode=1;
