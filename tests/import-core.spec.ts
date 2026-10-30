import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {addCsv,addJson,applyImport,csvTable,newInput,previewImport} from '../src/hardware/import';
import {emptyProject,isHardwareProject} from '../src/hardware/model';
const example=()=>fs.readFileSync('public/templates/hardware-example.json','utf8');
test('normalized shared sets, multiple items, strings, unknown data and stable IDs',()=>{
 const input=newInput();addJson(input,'example.json',example());const p=previewImport(input),again=previewImport(input);
 expect(p.issues).toEqual([]);expect(p.counts).toEqual({doors:2,hardwareSets:1,hardwareItems:2,assignments:2});
 expect(p.next.doors[0].doorMark).toBe('001');expect(p.next.hardwareItems[0].productCode).toBe('00123');
 expect(p.next.hardwareItems[0].quantity).toBe(3);expect(p.next.hardwareItems[0].extra.supplierReference).toBe('00009');
 expect(input.batch.extra.projectReference).toBe('Example pavilion');
 expect(p.next.assignments[0].hardwareSetRecordId).toBe(p.next.assignments[1].hardwareSetRecordId);
 expect(p.next.doors[0].id).toBe(again.next.doors[0].id);
 const applied=applyImport(p,emptyProject());expect(applied.imports[0].sources[0].text).toBe(example());
 expect(JSON.parse(JSON.stringify(applied)).doors[0].id).toBe(applied.doors[0].id);
 expect(isHardwareProject(applied)).toBe(true);
 const damaged=structuredClone(applied);damaged.assignments[0].hardwareSetRecordId='missing';expect(isHardwareProject(damaged)).toBe(false);
 expect(previewImport(input,applied).issues.some(e=>e.message.includes('already exists'))).toBe(true);
 expect(()=>applyImport(p,applied)).toThrow('Project changed');
 const duplicate=newInput();addJson(duplicate,'globalids.json',JSON.stringify({schemaVersion:1,doors:[{doorMark:'001',ifcGlobalId:'same'},{doorMark:'002',ifcGlobalId:'same'}]}));expect(previewImport(duplicate).issues.some(e=>e.field==='ifcGlobalId'&&e.message.includes('Duplicate'))).toBe(true);
});
test('CSV mapping, quoted commas, escaped quotes, newlines and leading zeros',()=>{
 const input=newInput();for(const [file,kind] of [['hardware-sets','hardwareSets'],['hardware-items','hardwareItems'],['door-assignments','doors']] as const)addCsv(input,csvTable(file+'.csv','\uFEFF'+fs.readFileSync('public/templates/'+file+'.csv','utf8'),kind));
 const p=previewImport(input);expect(p.issues).toEqual([]);expect(p.next.doors[0].doorMark).toBe('001');expect(p.next.hardwareItems[0].description).toBe('Hinge, ball bearing');expect(p.next.hardwareItems[1].description).toBe('Lever "office" lock');
 const mapped=newInput(),table=csvTable('custom.csv','Mark,Set,Location,Untouched\r\n0005,0007,"line one\nline two",00008\r\n','doors');table.mapping={doorMark:'Mark',hardwareSetId:'Set',level:'Location',ifcGlobalId:''};addCsv(mapped,table);
 const applied=applyImport(p,emptyProject());const m=previewImport(mapped,applied);expect(m.issues).toEqual([]);expect(m.next.doors.at(-1)!.level).toBe('line one\nline two');expect(m.next.doors.at(-1)!.extra.Untouched).toBe('00008');
});
test('all invalid rows stay staged; quantities, duplicate IDs, missing values and references block apply',()=>{
 const input=newInput();addJson(input,'bad.json',JSON.stringify({schemaVersion:1,doors:[{doorMark:'001',hardwareSetId:'MISSING'},{doorMark:'001'}],hardwareSets:[{hardwareSetId:'A'},{hardwareSetId:'A'}],hardwareItems:[{itemId:'01',hardwareSetId:'missing',quantity:-1},{itemId:'01',hardwareSetId:'A',quantity:'Infinity'},{hardwareSetId:'A',quantity:0}]}));
 const p=previewImport(input);expect(p.rows).toHaveLength(7);for(const text of ['does not exist','Duplicate identifier','Required field','finite number'])expect(p.issues.some(e=>e.message.includes(text))).toBe(true);
 expect(()=>applyImport(p,emptyProject())).toThrow('validation errors');expect(input.batch.sources[0].text).toContain('MISSING');
});
test('malformed sources, header collisions, extra cells, blank records and mapping collisions are errors',()=>{
 for(const text of ['itemId,itemId\n01,02\n','itemId,quantity\n01,1,extra\n','itemId,quantity\n\n','itemId,quantity\n"unterminated,1']){const i=newInput();addCsv(i,csvTable('bad.csv',text,'hardwareItems'));expect(previewImport(i).issues.length).toBeGreaterThan(0);}
 for(const text of ['null','{','{"schemaVersion":2,"doors":[]}','{"schemaVersion":1,"doors":[null,5]}','{"schemaVersion":1,"doors":[{"doorMark":1}]}']){const i=newInput();addJson(i,'bad.json',text);expect(previewImport(i).issues.length).toBeGreaterThan(0);}
 const i=newInput();const t=csvTable('collision.csv','value\n001\n','doors');t.mapping={doorMark:'value',ifcGlobalId:'value'};addCsv(i,t);expect(previewImport(i).issues.some(e=>e.field==='mapping')).toBe(true);
});
test('explicit assignment references and conflicting assignments are validated',()=>{
 const i=newInput();addJson(i,'conflicts.json',JSON.stringify({schemaVersion:1,hardwareSets:[{hardwareSetId:'A'}],doors:[{doorMark:'001',hardwareSetId:'A'}],assignments:[{doorMark:'001',hardwareSetId:'A'},{doorMark:'missing',hardwareSetId:'missing'}]}));const p=previewImport(i);expect(p.issues.some(e=>e.message.includes('Duplicate door assignment'))).toBe(true);expect(p.issues.some(e=>e.message.includes('Door "missing"'))).toBe(true);
});
