import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {addJson,newInput,previewImport,applyImport} from '../src/hardware/import';
import {emptyProject,isHardwareProject} from '../src/hardware/model';
import {scopeSchedules,proposeMatches,applyExactMatches,resolveManually,setAssignment,assignmentFor,refFor,setReviewStatus,addReviewComment,workflow,unbindSchedule,type ModelDoor} from '../src/hardware/workflow';
const model='sha256:'+'a'.repeat(64),other='sha256:'+'b'.repeat(64);
function project(){const i=newInput();addJson(i,'test.json',fs.readFileSync('public/templates/hardware-example.json','utf8'));return applyImport(previewImport(i),emptyProject());}
const doors=():ModelDoor[]=>[0,1].map(i=>({modelIdentity:model,globalId:`000000000000000000003${i}`,key:`000000000000000000003${i}`,name:`Door ${i+1}`,tag:`D-10${i+1}`,values:{'Attribute.Tag':[`D-10${i+1}`]}}));
const config={mode:'global-id' as const,property:'Attribute.Tag'};
test('scope first, unique GlobalId binding preserves originals and survives reload',()=>{
 let p=project(),d=doors(),original=JSON.stringify({doors:p.doors,assignments:p.assignments,imports:p.imports});
 expect(proposeMatches(p,d,model,config).every(r=>r.state==='unscoped')).toBe(true);
 p=scopeSchedules(p,model,p.doors.map(d=>d.id));expect(proposeMatches(p,d,other,config).every(r=>r.state==='wrong-model')).toBe(true);
 const revision=p.revision;p=applyExactMatches(p,d,model,config,revision);expect(workflow(p).bindings).toHaveLength(2);expect(workflow(p).assignments).toHaveLength(2);
 expect(workflow(p).bindings.every(b=>b.method==='global-id')).toBe(true);expect(JSON.stringify({doors:p.doors,assignments:p.assignments,imports:p.imports})).toBe(original);expect(isHardwareProject(JSON.parse(JSON.stringify(p)))).toBe(true);
 expect(proposeMatches(p,d,model,config).every(r=>r.state==='bound')).toBe(true);expect(()=>applyExactMatches(p,d,model,config,revision)).toThrow('changed');
});
test('two IFC doors with the same mark cannot receive silent assignments; resolve by explicit GlobalId',()=>{
 let p=project();p.doors[0].ifcGlobalId='';p.doors[0].doorMark='DUP';p.doors[1].ifcGlobalId='';p.doors[1].doorMark='UNMATCHED';p=scopeSchedules(p,model,p.doors.map(d=>d.id));
 const d=doors().map(d=>({...d,tag:'DUP',values:{'Attribute.Tag':['DUP']}})),c={mode:'door-mark' as const,property:'Attribute.Tag'};
 const rows=proposeMatches(p,d,model,c);expect(rows[0].state).toBe('ambiguous');expect(rows[0].candidateIds).toHaveLength(2);expect(rows[1].state).toBe('unmatched');expect(()=>applyExactMatches(p,d,model,c,p.revision)).toThrow('No safe');expect(workflow(p).assignments).toHaveLength(0);
 p=resolveManually(p,d,d[1].key,p.doors[0].id);expect(assignmentFor(p,refFor(d[0]))).toBeUndefined();expect(assignmentFor(p,refFor(d[1]))).toBeDefined();expect(workflow(p).bindings[0].method).toBe('manual');
});
test('invalid GlobalIds, convergent schedules, wrong model and conflicting source IDs stay queued',()=>{
 let p=project();p=scopeSchedules(p,model,p.doors.map(d=>d.id));
 expect(proposeMatches(p,doors().map(d=>({...d,identityIssue:'duplicate'})),model,config).every(r=>r.state==='ambiguous')).toBe(true);
 const d=doors();p.doors[0].doorMark=d[1].tag;expect(proposeMatches(p,d,model,{mode:'door-mark',property:'Attribute.Tag'})[0].state).toBe('conflict');
 p.doors[0].ifcGlobalId='';p.doors[1].ifcGlobalId='';p.doors[0].doorMark='X';p.doors[1].doorMark='X';d[0].values={'Attribute.Tag':['X']};expect(proposeMatches(p,d,model,{mode:'door-mark',property:'Attribute.Tag'}).every(r=>r.state==='ambiguous')).toBe(true);
});
test('manual reassign/remove and status/comments are separate, audited and model-scoped',()=>{
 let p=project();const d=doors()[0],copy={...d,modelIdentity:other};const source=JSON.stringify(p.doors);
 p=setAssignment(p,d,p.hardwareSets[0].id);p=setReviewStatus(p,d,'in-review');p=setReviewStatus(p,d,'changes-requested');p=addReviewComment(p,d,'Confirm latch handing.');p=setAssignment(p,d,null);
 expect(assignmentFor(p,refFor(copy))).toBeUndefined();expect(workflow(p).reviews[0].status).toBe('changes-requested');expect(workflow(p).comments[0].text).toBe('Confirm latch handing.');expect(workflow(p).history.filter(h=>h.kind==='assignment')).toHaveLength(2);expect(workflow(p).history.filter(h=>h.kind==='status')).toHaveLength(2);expect(JSON.stringify(p.doors)).toBe(source);expect(isHardwareProject(p)).toBe(true);
 expect(()=>setAssignment(p,{...d,identityIssue:'Duplicate'},p.hardwareSets[0].id)).toThrow('unique');
});
test('unique exact property matching, unlink and manual overrides are preserved',()=>{
 let p=project();const d=doors();for(let i=0;i<2;i++){p.doors[i].ifcGlobalId='';p.doors[i].doorMark=d[i].tag;}p=scopeSchedules(p,model,p.doors.map(d=>d.id));const c={mode:'door-mark' as const,property:'Attribute.Tag'};
 p=applyExactMatches(p,d,model,c,p.revision);expect(workflow(p).bindings[0].method).toBe('door-mark');p=setAssignment(p,d[0],null);expect(proposeMatches(p,d,model,c)[0].state).toBe('bound');p=unbindSchedule(p,d[0]);expect(workflow(p).bindings).toHaveLength(1);expect(assignmentFor(p,refFor(d[0]))).toBeUndefined();
});
