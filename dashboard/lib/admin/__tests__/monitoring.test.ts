import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { getDirectMonitoring } from '../cloud-monitoring';

test('Monitoring preserves distribution weights and combines request/error counts', async t => {
  const previousFetch = globalThis.fetch;
  const previousCredentials = process.env.GOOGLE_MONITORING_CREDENTIALS;
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type:'pkcs8', format:'pem' });
  process.env.GOOGLE_MONITORING_CREDENTIALS = JSON.stringify({ client_email:'reader@example.test',private_key:key });
  const calls: URL[] = [];
  const timestamp = '2026-10-04T12:00:00Z';
  const series = (value: number, code?: string) => ({ metric:{ labels:code ? { response_code_class:code } : {} },points:[{interval:{endTime:timestamp},value:{doubleValue:value}}] });
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === 'oauth2.googleapis.com') return Response.json({access_token:'isolated-test-token'});
    calls.push(url);
    if (url.searchParams.get('filter')!.includes('request_count')) return Response.json({timeSeries:[series(7,'2xx'),series(3,'5xx')]});
    return Response.json({timeSeries:[series(100)]});
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousCredentials === undefined) delete (process.env as Record<string,string | undefined>).GOOGLE_MONITORING_CREDENTIALS;
    else process.env.GOOGLE_MONITORING_CREDENTIALS = previousCredentials;
  });
  const result = await getDirectMonitoring('2026-10-04','2026-10-04',true);
  assert.equal(calls.length,8);
  for (const call of calls.filter(url => !url.searchParams.get('filter')!.includes('instance_count'))) {
    assert.equal(call.searchParams.get('aggregation.perSeriesAligner'),'ALIGN_SUM');
    assert.ok(call.searchParams.get('filter')!.includes('cloud_run_revision'));
  }
  for (const call of calls.filter(url => url.searchParams.get('filter')!.includes('request_latencies'))) {
    assert.match(call.searchParams.get('aggregation.crossSeriesReducer')!,/^REDUCE_PERCENTILE_(50|95|99)$/);
  }
  assert.equal(result.series.length,1);
  assert.equal(result.series[0].request_count,10);
  assert.equal(result.series[0].error_count,3);
  assert.equal(result.series[0].error_rate,0.3);
});
