import type { TracePayload } from '@/lib/traces/types';
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string,unknown> : {};
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const parse = (v: unknown): unknown => { if(typeof v==='string'){try{return JSON.parse(v);}catch{return null;}}return v; };
const text = (...values: unknown[]) => values.find(v=>typeof v==='string'&&v.length) as string|undefined;
const number = (...values: unknown[]) => values.find(v=>typeof v==='number'&&Number.isFinite(v)) as number|undefined;
/** One retrieval candidate as the matching stage logged it, best first. */
export interface PoolCandidate { rank: number; food: string | null; foodEn: string | null; id: string | null; source: string | null; state: string | null; matchType: string | null; confidence: string | null; similarity: number | null; chosen: boolean }
export interface MatchingRow { ingredient: string; food: string | null; source: string | null; rank: number | null; score: number | null; unmatched: boolean; pool: PoolCandidate[] }
/** Selection is evidence from the stage or final verdict; retrieval order alone never proves a choice. */
export function matchingRows(payload: TracePayload, assembly?: TracePayload | null, decomposition?: TracePayload | null): MatchingRow[] {
  if(!('output' in payload))return [];
  const output=parse(payload.output), out=record(output), input=record(parse(payload.input));
  const final=assembly&&'output' in assembly?record(parse(assembly.output)):{};
  const bridged=record(final.bridged??record(final.result).bridged);
  const verdicts=array(bridged.verdicts??final.verdicts).slice().sort((a,b)=>{
    const x=record(a),y=record(b);
    return (number(x.mealItemIdx)??0)-(number(y.mealItemIdx)??0)||(number(x.ingredientIdx)??0)-(number(y.ingredientIdx)??0);
  });
  const decomp=decomposition&&'output' in decomposition?record(parse(decomposition.output)):{};
  const ingredients=array(decomp.mealItems??input.mealItems).flatMap(item=>array(record(item).ingredients));
  const pools=Array.isArray(output)?output:array(out.matchResults??out.matches??out.matched);
  const unmatched=array(out.unmatched??out.unmatchedIngredients);
  return [...pools.map((entry,i):MatchingRow=>{
    const row=record(entry), candidates=array(row.candidates), idx=number(row.ingredientIndex)??i;
    const ingredient=record(ingredients[idx]), first=record(record(candidates[0]).info);
    const name=text(row.ingredientName,record(row.ingredient).canonicalName,record(row.ingredient).name,ingredient.canonicalName,ingredient.name,first.ingredientName)??`Ingredient ${idx+1}`;
    const verdict=record(verdicts[idx]);
    const selected=number(row.selectedCandidateIdx,verdict.selectedCandidateIdx);
    const explicit=record(row.chosenFood??row.chosen??row.match);
    const rejected=['unmatched','rejected','missing'].includes(String(verdict.verdict??row.verdict));
    const chosen=rejected?{}:selected!=null?record(candidates[selected]):Object.keys(explicit).length?explicit:row.matchedName?row:{};
    const info=record(chosen.info??chosen), prompt=record(chosen.prompt);
    const food=text(info.matchedName,info.dbName,info.name,prompt.name)??null;
    const rank=food?(selected!=null?selected+1:number(row.selectedRank,row.rank)??null):null;
    const pool=candidates.map((c,k):PoolCandidate=>{const i=record(record(c).info);return {rank:k+1,food:text(i.matchedName)??null,foodEn:text(i.matchedNameEn)??null,id:text(i.foodCompositionId)??null,source:text(i.source)??null,state:text(i.state)??null,matchType:text(i.matchType)??null,confidence:text(i.confidence)??null,similarity:number(i.similarity)??null,chosen:food!=null&&rank===k+1};});
    return {ingredient:text(record(verdict.grounded).ingredientName)??name,food,source:food?text(info.source,chosen.source)??null:null,rank,score:food?number(info.similarity,prompt.score,chosen.similarity,chosen.score)??null:null,unmatched:rejected||(!food&&Array.isArray(row.candidates)&&!candidates.length),pool};
  }),...unmatched.map((v,i):MatchingRow=>({ingredient:typeof v==='string'?v:text(record(v).ingredientName,record(v).name)??`Ingredient ${pools.length+i+1}`,food:null,source:null,rank:null,score:null,unmatched:true,pool:[]}))];
}
