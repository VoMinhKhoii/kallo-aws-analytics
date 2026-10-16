import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenText,callLatency } from '../format';
test('call usage shows explicit token labels, separators and only recorded cache usage',()=>{
  assert.equal(tokenText({inputTokens:1556,cachedTokens:556,outputTokens:19}),'in 1,556 · cached 556 · out 19');
  for(const cachedTokens of [0,null])assert.equal(tokenText({inputTokens:1556,cachedTokens,outputTokens:19}),'in 1,556 · out 19');
  assert.equal(callLatency(null),'—');assert.equal(callLatency(0),'—');assert.equal(callLatency(10),'10 ms');
});

test('trace header totals use compact token formatting', async()=>{
  const { compact } = await import('../../ai-usage/format');
  assert.equal(`${compact(57999)} tokens`,'58K tokens');
});
