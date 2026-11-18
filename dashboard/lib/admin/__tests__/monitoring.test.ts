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
    // The real-visitor latency is a log-based metric recorded in seconds.
    if (url.searchParams.get('filter')!.includes('kallo_app_latency')) return Response.json({timeSeries:[series(0.25)]});
    return Response.json({timeSeries:[series(100)]});
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousCredentials === undefined) delete (process.env as Record<string,string | undefined>).GOOGLE_MONITORING_CREDENTIALS;
    else process.env.GOOGLE_MONITORING_CREDENTIALS = previousCredentials;
  });
  const result = await getDirectMonitoring('2026-10-04','2026-10-04',true);
  // 8 Cloud Run series plus the real-visitor latency at p50, p95 and p99.
  assert.equal(calls.length,11);
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
  assert.equal(result.series[0].app_p95_ms,250);
  calls.length=0;
  const rolling=await getDirectMonitoring('2026-10-03T12:17:00.000Z','2026-10-04T12:17:00.000Z',true);
  assert.equal(rolling.alignment_seconds,3600);
  assert.equal(rolling.window_p95_ms,100);assert.equal(rolling.window_p99_ms,100);
  assert.equal(rolling.window_app_p95_ms,250);assert.equal(rolling.window_app_p99_ms,250);
  assert.equal(calls.filter(c=>c.searchParams.get('aggregation.alignmentPeriod')==='3600s').length,11);
  assert.equal(calls.filter(c=>c.searchParams.get('aggregation.alignmentPeriod')==='86400s').length,4);
  for(const call of calls) {
    assert.equal(call.searchParams.get('interval.startTime'),'2026-10-03T12:17:00.000Z');
    assert.equal(call.searchParams.get('interval.endTime'),'2026-10-04T12:17:00.000Z');
    assert.ok(['3600s','86400s'].includes(call.searchParams.get('aggregation.alignmentPeriod')!));
  }

});

test('A missing real-visitor latency metric leaves the rest of System intact', async t => {
  const previousFetch = globalThis.fetch;
  const previousCredentials = process.env.GOOGLE_MONITORING_CREDENTIALS;
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type:'pkcs8', format:'pem' });
  process.env.GOOGLE_MONITORING_CREDENTIALS = JSON.stringify({ client_email:'reader@example.test',private_key:key });
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === 'oauth2.googleapis.com') return Response.json({access_token:'isolated-test-token-2'});
    if (url.searchParams.get('filter')!.includes('kallo_app_latency')) return new Response('not found', {status:404});
    return Response.json({timeSeries:[{metric:{labels:{}},points:[{interval:{endTime:'2026-10-05T12:00:00Z'},value:{doubleValue:100}}]}]});
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousCredentials === undefined) delete (process.env as Record<string,string | undefined>).GOOGLE_MONITORING_CREDENTIALS;
    else process.env.GOOGLE_MONITORING_CREDENTIALS = previousCredentials;
  });
  const result = await getDirectMonitoring('2026-10-05','2026-10-05',true);
  assert.equal(result.series[0].p95_ms,100);
  assert.equal(result.series[0].app_p95_ms,undefined);
});
