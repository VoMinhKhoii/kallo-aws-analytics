import test from 'node:test';
import assert from 'node:assert/strict';
import { PreviewReview } from '../../premium-preview';
import { toggleBranch } from '../../json-expansion';
import { downloadJson } from '../../download-json';

test('preview edits and cancellation discard late responses and confirmation retains snapshot', async () => {
  const review = new PreviewReview<{action:string;input:{days:number}}>();
  const operation = {action:'give',input:{days:3}};
  const ticket = review.begin(operation);
  operation.input.days=9;
  assert.equal(ticket.snapshot.input.days,3);
  review.invalidate();
  assert.equal(review.accept(ticket),null);
  const next=review.begin(operation);
  assert.deepEqual(review.accept(next),{action:'give',input:{days:9}});
});
test('collapse one branch after Expand all preserves root and siblings', () => {
  const paths=['$','$/a','$/b','$/b/c'];
  assert.deepEqual([...toggleBranch(new Set(),true,paths,'$/a',true)],['$','$/b','$/b/c']);
});
test('call Download JSON exports full fetched prompt and response', () => {
  let blob:Blob|undefined;let filename='';
  const payload={prompt:'p'.repeat(1100000),response:'end of complete response'};
  downloadJson('trace-call.json',{metadata:{id:'call'},payload},{save:(b,n)=>{blob=b;filename=n;}});
  assert.equal(filename,'trace-call.json');
  return blob!.text().then(text=>assert.deepEqual(JSON.parse(text).payload,payload));
});
