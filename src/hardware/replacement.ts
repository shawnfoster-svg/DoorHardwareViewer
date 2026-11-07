import type {HardwareProject} from './model';
import type {ModelSnapshot,ReplacementPlan} from './exchange-model';
import {workflow,emptyWorkflow,same,type DoorRef} from './workflow';
const refKey=(r:DoorRef)=>JSON.stringify([r.modelIdentity,r.ifcGlobalId]);
export function replacementPreview(p:HardwareProject,fromIdentity:string,toIdentity:string):ReplacementPlan {
 const from=p.models?.find(m=>m.identity===fromIdentity),to=p.models?.find(m=>m.identity===toIdentity);
 if(!from||!to||fromIdentity===toIdentity)throw new Error('Choose distinct known source and replacement models.');
 const w=workflow(p),tracked=[...w.assignments,...w.reviews,...w.bindings].filter(r=>r.modelIdentity===fromIdentity);
 const ids=[...new Set([...from.doors.map(d=>d.globalId||''),...tracked.map(r=>r.ifcGlobalId)])];
 return {id:crypto.randomUUID(),fromIdentity,toIdentity,createdAt:new Date().toISOString(),rows:ids.map(oldGlobalId=>{
  const old=from.doors.filter(d=>d.globalId===oldGlobalId),candidates=to.doors.filter(d=>d.globalId===oldGlobalId),base={oldGlobalId,candidateGlobalIds:candidates.map(c=>c.globalId!).filter(Boolean)};
  if(!oldGlobalId||old.length>1||old.some(d=>d.identityIssue)||candidates.length>1||candidates.some(d=>d.identityIssue))return {...base,state:'ambiguous' as const,reason:'Missing or duplicate source/target identity. Manual reconciliation required.'};
  if(!candidates.length)return {...base,state:'missing' as const,reason:'GlobalId is absent from the replacement. Do not infer a door-mark or position match.'};
  const target={modelIdentity:toIdentity,ifcGlobalId:oldGlobalId};if([...w.assignments,...w.reviews,...w.bindings].some(r=>same(r,target)))return {...base,state:'conflict' as const,reason:'Replacement target already contains review data. No overwrite permitted.'};
  if(!old.length||from.inventoryComplete===false||old[0].signature!==candidates[0].signature)return {...base,state:'changed' as const,reason:'GlobalId agrees but geometry/properties changed or the source inventory is unknown. Explicit confirmation required.'};
  return {...base,state:'unique' as const,reason:'One identical door signature and exact GlobalId. Eligible for controlled transfer.'};
 })};
}
export function saveReplacement(p:HardwareProject,plan:ReplacementPlan){const next=structuredClone(p);next.revision++;next.replacements??=[];next.replacements.push(structuredClone(plan));return next;}
export function transferReplacement(p:HardwareProject,planId:string,choices:{oldGlobalId:string;targetGlobalId:string;method:'global-id'|'manual'}[],expectedRevision:number):HardwareProject {
 if(p.revision!==expectedRevision)throw new Error('Review changed. Refresh the reconciliation preview.');
 const next=structuredClone(p),plan=next.replacements?.find(r=>r.id===planId);if(!plan)throw new Error('Reconciliation plan is missing.');
 const to=next.models?.find(m=>m.identity===plan.toIdentity);if(!to)throw new Error('Replacement inventory is missing.');
 next.workflow=structuredClone(workflow(p));const w=next.workflow;
 const now=new Date().toISOString(),used=new Set<string>();
 for(const choice of choices){
  const row=plan.rows.find(r=>r.oldGlobalId===choice.oldGlobalId);if(!row||row.state==='resolved')throw new Error('Record already resolved or missing.');
  const candidates=to.doors.filter(d=>d.globalId===choice.targetGlobalId);if(candidates.length!==1||!choice.targetGlobalId||candidates[0].identityIssue)throw new Error('Target needs a unique valid GlobalId.');
  if(choice.method==='global-id'&&(row.state!=='unique'||choice.targetGlobalId!==row.oldGlobalId||replacementPreview(p,plan.fromIdentity,plan.toIdentity).rows.find(r=>r.oldGlobalId===row.oldGlobalId)?.state!=='unique'))throw new Error('Only unchanged unique exact matches can transfer automatically.');
  const target={modelIdentity:plan.toIdentity,ifcGlobalId:choice.targetGlobalId},source={modelIdentity:plan.fromIdentity,ifcGlobalId:row.oldGlobalId};
  if(used.has(refKey(target))||[...w.assignments,...w.reviews,...w.bindings].some(r=>same(r,target)))throw new Error('Target is occupied. No review data was overwritten.');used.add(refKey(target));
  const original=workflow(p),assignment=original.assignments.find(a=>same(a,source)),review=original.reviews.find(r=>same(r,source)),binding=original.bindings.find(r=>same(r,source));
  if(assignment)w.assignments.push({...assignment,...target,id:crypto.randomUUID(),method:choice.method});
  let reviewId:string|null=null;if(review){reviewId=crypto.randomUUID();w.reviews.push({...review,...target,id:reviewId});for(const c of original.comments.filter(c=>c.reviewRecordId===review.id))w.comments.push({...c,id:crypto.randomUUID(),reviewRecordId:reviewId});}
  // Original bindings/scopes remain archived on their original model, never rewritten.
  w.history.push({...target,id:crypto.randomUUID(),at:now,kind:'replacement',method:choice.method,before:{source,assignment:assignment||null,review:review||null,binding:binding||null},after:{target,reviewId,planId}});
  row.state='resolved';row.resolvedTo=choice.targetGlobalId;row.method=choice.method;row.resolvedAt=now;
 }
 if(!choices.length)throw new Error('No eligible records selected.');next.revision++;return next;
}
