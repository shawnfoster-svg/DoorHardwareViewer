import type { HardwareProject } from './model';
export type ReviewStatus='not-reviewed'|'in-review'|'accepted'|'changes-requested';
export const statusLabels:Record<ReviewStatus,string>={'not-reviewed':'Not reviewed','in-review':'In review',accepted:'Accepted','changes-requested':'Changes required'};
export interface DoorRef {modelIdentity:string; ifcGlobalId:string;}
export interface ModelDoor {modelIdentity:string;globalId:string|null;key:string;name:string;tag:string;identityIssue?:string;values?:Record<string,string[]>;}
export type MatchMethod='global-id'|'door-mark'|'manual';
export interface Binding extends DoorRef {id:string;scheduleDoorId:string;method:MatchMethod;property:string;sourceValue:string;matchedValue:string;createdAt:string;}
export interface ModelAssignment extends DoorRef {id:string;hardwareSetRecordId:string;method:MatchMethod;scheduleDoorId?:string;}
export interface ModelReview extends DoorRef {id:string;status:ReviewStatus;}
export interface ModelComment {id:string;reviewRecordId:string;text:string;createdAt:string;}
export interface ChangeEvent extends DoorRef {id:string;at:string;kind:'assignment'|'status'|'comment'|'binding'|'scope';before:unknown;after:unknown;method:string;}
export interface Workflow {version:1;scopes:{scheduleDoorId:string;modelIdentity:string}[];bindings:Binding[];assignments:ModelAssignment[];reviews:ModelReview[];comments:ModelComment[];history:ChangeEvent[];}
export const emptyWorkflow=():Workflow=>({version:1,scopes:[],bindings:[],assignments:[],reviews:[],comments:[],history:[]});
export const workflow=(p:HardwareProject)=>p.workflow||emptyWorkflow();
export const same=(a:DoorRef,b:DoorRef)=>a.modelIdentity===b.modelIdentity&&a.ifcGlobalId===b.ifcGlobalId;
export function refFor(door:ModelDoor):DoorRef {if(!door.globalId||door.identityIssue)throw new Error('Door needs a unique IFC GlobalId. Resolve its identity before saving.');return {modelIdentity:door.modelIdentity,ifcGlobalId:door.globalId};}
export const assignmentFor=(p:HardwareProject,r:DoorRef)=>workflow(p).assignments.find(a=>same(a,r));
export const reviewFor=(p:HardwareProject,r:DoorRef)=>workflow(p).reviews.find(a=>same(a,r));
function edit(p:HardwareProject){const n=structuredClone(p);n.workflow=structuredClone(workflow(p));n.revision++;return n as HardwareProject&{workflow:Workflow};}
function event(w:Workflow,r:DoorRef,kind:ChangeEvent['kind'],before:unknown,after:unknown,method:string){w.history.push({...r,id:crypto.randomUUID(),at:new Date().toISOString(),kind,before:structuredClone(before),after:structuredClone(after),method});}
export function scopeSchedules(p:HardwareProject,modelIdentity:string,ids:string[]):HardwareProject {
 if(!modelIdentity.startsWith('sha256:'))throw new Error('Open a model before confirming its scope.');
 const n=edit(p);
 for(const id of new Set(ids)){
  const d=n.doors.find(d=>d.id===id);if(!d)throw new Error('Schedule record is missing.');
  const scope=n.workflow.scopes.find(s=>s.scheduleDoorId===id);
  if((d.modelIdentity&&d.modelIdentity!==modelIdentity)||(scope&&scope.modelIdentity!==modelIdentity))throw new Error('Schedule already belongs to another model. Revision migration is not automatic.');
  if(!scope){n.workflow.scopes.push({scheduleDoorId:id,modelIdentity});event(n.workflow,{modelIdentity,ifcGlobalId:d.ifcGlobalId},'scope',null,{scheduleDoorId:id},'reviewer-confirmed-model');}
 }
 return n;
}
export interface MatchConfig {mode:'global-id'|'door-mark';property:string;}
export interface MatchRow {scheduleDoorId:string;doorMark:string;state:'ready'|'bound'|'unscoped'|'wrong-model'|'unmatched'|'ambiguous'|'conflict';reason:string;candidateIds:string[];method:MatchMethod;property:string;sourceValue:string;}
export function proposeMatches(p:HardwareProject,doors:ModelDoor[],modelIdentity:string,config:MatchConfig):MatchRow[]{
 const w=workflow(p);
 const result=p.doors.map(d=>{
  const row:MatchRow={scheduleDoorId:d.id,doorMark:d.doorMark,state:'unmatched',reason:'No exact match.',candidateIds:[],method:config.mode==='global-id'?'global-id':'door-mark',property:config.mode==='global-id'?'GlobalId':config.property,sourceValue:config.mode==='global-id'?d.ifcGlobalId:d.doorMark};
  const scope=d.modelIdentity||w.scopes.find(s=>s.scheduleDoorId===d.id)?.modelIdentity;
  if(!scope)return {...row,state:'unscoped' as const,reason:'Confirm which model this schedule belongs to.'};
  if(scope!==modelIdentity)return {...row,state:'wrong-model' as const,reason:'Schedule is scoped to another model fingerprint.'};
  if(w.bindings.some(b=>b.scheduleDoorId===d.id))return {...row,state:'bound' as const,reason:'Already bound; existing reviewer edits will not be reapplied.'};
  if(!row.sourceValue)return row;
  const candidates=doors.filter(m=>m.modelIdentity===modelIdentity&&(config.mode==='global-id'?m.globalId===d.ifcGlobalId:(m.values?.[config.property]||[]).includes(d.doorMark)));
  row.candidateIds=candidates.map(c=>c.key);
  if(candidates.length!==1)return {...row,state:candidates.length?'ambiguous':'unmatched',reason:candidates.length?'Multiple IFC doors have this exact value. Choose explicitly.':'No IFC door has this exact value.'} as MatchRow;
  const c=candidates[0];
  if(c.identityIssue||!c.globalId)return {...row,state:'ambiguous' as const,reason:'Candidate has an invalid or duplicate IFC GlobalId.'};
  if(config.mode==='door-mark'&&new Set(c.values?.[config.property]||[]).size!==1)return {...row,state:'ambiguous' as const,reason:'Selected IFC property has conflicting values.'};
  if(config.mode==='door-mark'&&d.ifcGlobalId&&d.ifcGlobalId!==c.globalId)return {...row,state:'conflict' as const,reason:'Door mark agrees but imported GlobalId disagrees. Resolve manually.'};
  if(w.bindings.some(b=>same(b,refFor(c)))||w.assignments.some(b=>same(b,refFor(c))))return {...row,state:'conflict' as const,reason:'IFC door already has a binding or reviewer assignment. Resolve explicitly.'};
  return {...row,state:'ready' as const,reason:'Unique exact match within the confirmed model.'};
 });
 // Global guard: several schedule records must never converge on one model door.
 for(const r of result)if(r.state==='ready'&&result.some(other=>other!==r&&other.candidateIds.some(id=>r.candidateIds.includes(id)))){r.state='ambiguous';r.reason='Multiple schedule records target this IFC door.';}
 return result;
}
function bindInto(n:HardwareProject&{workflow:Workflow},d:ModelDoor,scheduleId:string,method:MatchMethod,property:string,sourceValue:string){
 const r=refFor(d),schedule=n.doors.find(x=>x.id===scheduleId);if(!schedule)throw new Error('Schedule record is missing.');
 const scope=schedule.modelIdentity||n.workflow.scopes.find(s=>s.scheduleDoorId===scheduleId)?.modelIdentity;
 if(scope!==r.modelIdentity)throw new Error('Confirm the correct model scope first.');
 if(n.workflow.bindings.some(b=>b.scheduleDoorId===scheduleId||same(b,r)))throw new Error('Schedule or IFC door is already bound. Existing bindings are protected.');
 if(assignmentFor(n,r))throw new Error('Door already has a reviewer assignment. Remove it explicitly before resolving a schedule binding.');
 const b:Binding={...r,id:crypto.randomUUID(),scheduleDoorId:scheduleId,method,property,sourceValue,matchedValue:method==='global-id'?r.ifcGlobalId:method==='door-mark'?sourceValue:r.ifcGlobalId,createdAt:new Date().toISOString()};n.workflow.bindings.push(b);event(n.workflow,r,'binding',null,b,method);
 const original=n.assignments.find(a=>a.doorRecordId===scheduleId);
 if(original){const a:ModelAssignment={...r,id:crypto.randomUUID(),hardwareSetRecordId:original.hardwareSetRecordId,method,scheduleDoorId:scheduleId};n.workflow.assignments.push(a);event(n.workflow,r,'assignment',null,a,method);}
}
export function applyExactMatches(p:HardwareProject,doors:ModelDoor[],identity:string,config:MatchConfig,expectedRevision:number){
 if(p.revision!==expectedRevision)throw new Error('Data changed. Generate a fresh matching preview.');
 const rows=proposeMatches(p,doors,identity,config).filter(r=>r.state==='ready');if(!rows.length)throw new Error('No safe exact matches to apply.');
 const n=edit(p);for(const r of rows)bindInto(n,doors.find(d=>d.key===r.candidateIds[0])!,r.scheduleDoorId,r.method,r.property,r.sourceValue);return n;
}
export function resolveManually(p:HardwareProject,doors:ModelDoor[],key:string,scheduleId:string){const d=doors.find(d=>d.key===key);if(!d)throw new Error('Selected model door is no longer available.');const n=edit(p);bindInto(n,d,scheduleId,'manual','reviewer-selected GlobalId',p.doors.find(d=>d.id===scheduleId)?.ifcGlobalId||'');return n;}
export function setAssignment(p:HardwareProject,d:ModelDoor,setId:string|null){
 const r=refFor(d);if(setId&&!p.hardwareSets.some(s=>s.id===setId))throw new Error('Hardware set does not exist.');const n=edit(p),before=assignmentFor(n,r)||null;
 n.workflow.assignments=n.workflow.assignments.filter(a=>!same(a,r));
 const after=setId?{...r,id:before?.id||crypto.randomUUID(),hardwareSetRecordId:setId,method:'manual' as const}:null;
 if(after)n.workflow.assignments.push(after);event(n.workflow,r,'assignment',before,after,'manual');return n;
}
export function setReviewStatus(p:HardwareProject,d:ModelDoor,status:ReviewStatus){
 if(!Object.hasOwn(statusLabels,status))throw new Error('Invalid review status.');const r=refFor(d),n=edit(p);let review=reviewFor(n,r);const before=review?.status||'not-reviewed';
 if(!review){review={...r,id:crypto.randomUUID(),status};n.workflow.reviews.push(review);}else review.status=status;
 event(n.workflow,r,'status',before,status,'manual');return n;
}
export function addReviewComment(p:HardwareProject,d:ModelDoor,text:string){
 if(!text.trim())throw new Error('Enter a nonempty comment.');const r=refFor(d),n=edit(p);let review=reviewFor(n,r);
 if(!review){review={...r,id:crypto.randomUUID(),status:'not-reviewed'};n.workflow.reviews.push(review);}
 const c={id:crypto.randomUUID(),reviewRecordId:review.id,text,createdAt:new Date().toISOString()};n.workflow.comments.push(c);event(n.workflow,r,'comment',null,c,'manual');return n;
}
export function validWorkflow(w:Workflow,p:HardwareProject):boolean {
 try {
  if(!w||w.version!==1||!['scopes','bindings','assignments','reviews','comments','history'].every(k=>Array.isArray(w[k as keyof Workflow])))return false;
  const str=(v:unknown)=>typeof v==='string',nonempty=(v:unknown)=>str(v)&&!!(v as string).trim();
  const ref=(r:DoorRef)=>!!r&&nonempty(r.modelIdentity)&&nonempty(r.ifcGlobalId);
  const unique=(values:string[])=>new Set(values).size===values.length;
  const key=(r:DoorRef)=>JSON.stringify([r.modelIdentity,r.ifcGlobalId]);
  const doors=new Set(p.doors.map(d=>d.id)),sets=new Set(p.hardwareSets.map(s=>s.id));
  if(!w.scopes.every(s=>s&&doors.has(s.scheduleDoorId)&&nonempty(s.modelIdentity))||!unique(w.scopes.map(s=>s.scheduleDoorId)))return false;
  if(!w.bindings.every(b=>ref(b)&&doors.has(b.scheduleDoorId)&&['global-id','door-mark','manual'].includes(b.method)&&[b.property,b.sourceValue,b.matchedValue,b.createdAt].every(str))||!unique(w.bindings.map(key))||!unique(w.bindings.map(b=>b.scheduleDoorId)))return false;
  if(!w.assignments.every(a=>ref(a)&&sets.has(a.hardwareSetRecordId)&&['global-id','door-mark','manual'].includes(a.method)&&(!a.scheduleDoorId||doors.has(a.scheduleDoorId)))||!unique(w.assignments.map(key)))return false;
  if(!w.reviews.every(r=>ref(r)&&Object.hasOwn(statusLabels,r.status))||!unique(w.reviews.map(key)))return false;
  const reviews=new Set(w.reviews.map(r=>r.id));
  if(!w.comments.every(c=>c&&reviews.has(c.reviewRecordId)&&str(c.text)&&nonempty(c.createdAt)))return false;
  if(!w.history.every(h=>h&&nonempty(h.modelIdentity)&&str(h.ifcGlobalId)&&['scope','binding','assignment','status','comment'].includes(h.kind)&&str(h.method)&&str(h.at)))return false;
  const ids=[...w.bindings,...w.assignments,...w.reviews,...w.comments,...w.history].map(r=>r.id);return ids.every(nonempty)&&unique(ids);
 }catch{return false;}
}
export function unbindSchedule(p:HardwareProject,d:ModelDoor){
 const r=refFor(d),n=edit(p),binding=n.workflow.bindings.find(b=>same(b,r));if(!binding)throw new Error('Door has no schedule link.');
 n.workflow.bindings=n.workflow.bindings.filter(b=>!same(b,r));event(n.workflow,r,'binding',binding,null,'manual-unlink');
 const a=assignmentFor(n,r);if(a&&a.scheduleDoorId===binding.scheduleDoorId&&a.method!=='manual'){n.workflow.assignments=n.workflow.assignments.filter(x=>!same(x,r));event(n.workflow,r,'assignment',a,null,'manual-unlink');}
 return n;
}
