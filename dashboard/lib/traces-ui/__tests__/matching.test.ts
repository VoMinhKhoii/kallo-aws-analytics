import test from 'node:test';
import assert from 'node:assert/strict';
import { matchingRows } from '../matching';
const candidate=(name:string,score:number)=>({info:{ingredientName:'rice',matchedName:name,source:'fao',similarity:score}});
test('matching choices use final selections, preserve source/rank/score and show empty pools',()=>{
  const rows=matchingRows({input:{ingredientCount:3},output:[{ingredientIndex:0,candidates:[candidate('Rice',.9),candidate('Brown rice',.8)]},{ingredientIndex:1,candidates:[]},{ingredientIndex:2,candidates:[candidate('Oil',.99)]}]},{input:null,output:{bridged:{verdicts:[{verdict:'accepted',selectedCandidateIdx:1,grounded:{ingredientName:'brown rice'}},{verdict:'unmatched',selectedCandidateIdx:null},{verdict:'rejected',selectedCandidateIdx:0}]}}},{input:null,output:{mealItems:[{ingredients:[{canonicalName:'rice'},{canonicalName:'ghost'},{canonicalName:'oil'}]}]}});
  assert.deepEqual(rows.map(({pool:_pool,...r})=>r),[{ingredient:'brown rice',food:'Brown rice',source:'fao',rank:2,score:.8,unmatched:false},{ingredient:'ghost',food:null,source:null,rank:null,score:null,unmatched:true},{ingredient:'oil',food:null,source:null,rank:null,score:null,unmatched:true}]);
});
test('each row carries its retrieval pool, best first, with the final choice marked',()=>{
  const rows=matchingRows({input:null,output:[{ingredientIndex:0,candidates:[candidate('Rice',.9),candidate('Brown rice',.8)]},{ingredientIndex:1,candidates:[]}]},{input:null,output:{bridged:{verdicts:[{mealItemIdx:0,ingredientIdx:0,verdict:'accepted',selectedCandidateIdx:1},{mealItemIdx:0,ingredientIdx:1,verdict:'unmatched'}]}}});
  assert.deepEqual(rows[0].pool.map(c=>[c.rank,c.food,c.similarity,c.chosen]),[[1,'Rice',.9,false],[2,'Brown rice',.8,true]]);
  assert.deepEqual(rows[1].pool,[]);
});
test('retrieval candidates alone never imply a confirmed choice',()=>{
  const rows=matchingRows({input:null,output:[{ingredientIndex:0,candidates:[candidate('Rice',.95)]}]});
  assert.equal(rows[0].food,null);assert.equal(rows[0].rank,null);assert.equal(rows[0].unmatched,false);
});
test('legacy direct matches and unmatched labels are retained without inventing ranks',()=>{
  const rows=matchingRows({input:null,output:{matched:[{ingredientName:'rice',matchedName:'Rice',similarity:.9,source:'catalog'}],unmatched:[{ingredientName:'ghost'}]}});
  assert.deepEqual(rows[0],{ingredient:'rice',food:'Rice',source:'catalog',rank:null,score:.9,unmatched:false,pool:[]});
  assert.equal(rows[1].ingredient,'ghost');assert.equal(rows[1].unmatched,true);
  assert.deepEqual(matchingRows({input:null,output:null}),[]);
});

test('final verdicts join in flat ingredient order even when capture order differs',()=>{
  const rows=matchingRows({input:null,output:[{ingredientIndex:0,candidates:[candidate('Rice',.9)]},{ingredientIndex:1,candidates:[candidate('Oil',.8)]}]},{input:null,output:{bridged:{verdicts:[{mealItemIdx:1,ingredientIdx:0,verdict:'accepted',selectedCandidateIdx:0,grounded:{ingredientName:'oil'}},{mealItemIdx:0,ingredientIdx:0,verdict:'accepted',selectedCandidateIdx:0,grounded:{ingredientName:'rice'}}]}}});
  assert.deepEqual(rows.map(r=>[r.ingredient,r.food]),[['rice','Rice'],['oil','Oil']]);
});
