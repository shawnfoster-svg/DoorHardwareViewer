import Papa from 'papaparse';
import { emptyProject, type HardwareProject, type ImportBatch, type ImportedRecord, type Source } from './model';
export type TableKind = 'doors'|'hardwareSets'|'hardwareItems'|'assignments';
export const fields: Record<TableKind, string[]> = {
 doors:['doorMark','ifcGlobalId','level','hardwareSetId'],hardwareSets:['hardwareSetId','description'],
 hardwareItems:['itemId','hardwareSetId','quantity','unit','category','manufacturer','productCode','description','finish','notes'],
 assignments:['doorMark','hardwareSetId'],
};
export interface Issue { source: string; table: string; row: number; field: string; message: string; }
export interface SourceRow { sourceId: string; table: TableKind; row: number; values: Record<string,unknown>; }
export interface CsvTable { source: Source; kind: TableKind; headers: string[]; rows: SourceRow[]; issues: Issue[]; mapping: Record<string,string>; }
export interface ImportInput { batch: ImportBatch; tables: CsvTable[]; jsonRows: SourceRow[]; issues: Issue[]; ids: Map<string,string>; }
export interface Preview { input: ImportInput; baseRevision: number; next: HardwareProject; issues: Issue[]; rows: {table: string; row: number; source: string; values: Record<string,unknown>}[]; counts: Record<string,number>; }
const object = (x:unknown): x is Record<string,unknown> => !!x && typeof x==='object' && !Array.isArray(x);
export function newInput(): ImportInput {return {batch:{id:crypto.randomUUID(),importedAt:'',sources:[],mappings:{},extra:{}},tables:[],jsonRows:[],issues:[],ids:new Map()};}
export function csvTable(name:string,text:string,kind:TableKind): CsvTable {
 const source:Source={id:crypto.randomUUID(),name,format:'csv',text};
 // Parse positional cells so duplicate headers and surplus cells cannot overwrite data.
 const parsed=Papa.parse<string[]>(text.replace(/^\uFEFF/,''),{header:false,dynamicTyping:false,skipEmptyLines:false,delimiter:','});
 const headers=parsed.data[0]||[];const issues:Issue[]=[];
 const err=(row:number,field:string,message:string)=>issues.push({source:name,table:kind,row,field,message});
 if(!headers.length||headers.every(h=>!h.trim()))err(1,'header','A nonempty CSV header is required.');
 for(const h of new Set(headers))if(!h.trim()||headers.filter(x=>x===h).length>1)err(1,h,'Blank or duplicate CSV header; rename columns before import.');
 for(const e of parsed.errors)err((e.row??0)+1,'csv',e.message);
 const rows:SourceRow[]=[];
 parsed.data.slice(1).forEach((cells,index)=>{
  // A final newline is not a record. Interior blank records are not discarded.
  if(index===parsed.data.length-2&&cells.length===1&&cells[0]==='')return;
  const row=index+2;
  if(cells.length!==headers.length)err(row,'csv',`Expected ${headers.length} cells, received ${cells.length}.`);
  const values=Object.fromEntries(cells.map((v,i)=>[headers[i]||`__column_${i+1}`,v]));
  rows.push({sourceId:source.id,table:kind,row,values});
 });
 return {source,kind,headers,rows,issues,mapping:Object.fromEntries(fields[kind].map(f=>[f,headers.includes(f)?f:'']))};
}
export function addCsv(input:ImportInput,table:CsvTable) { input.tables.push(table);input.batch.sources.push(table.source); }
export function addJson(input:ImportInput,name:string,text:string) {
 const source:Source={id:crypto.randomUUID(),name,format:'json',text};input.batch.sources.push(source);
 const err=(table:string,row:number,field:string,message:string)=>input.issues.push({source:name,table,row,field,message});
 let data:unknown;try{data=JSON.parse(text);}catch(e){err('document',0,'json',`Invalid JSON: ${String(e)}`);return;}
 if(!object(data)){err('document',0,'json','Expected a JSON object.');return;}
 if(data.schemaVersion!==1)err('document',0,'schemaVersion','Expected schemaVersion: 1. No automatic version conversion.');
 input.batch.extra=Object.fromEntries(Object.entries(data).filter(([k])=>!['schemaVersion',...Object.keys(fields)].includes(k)));
 for(const kind of Object.keys(fields) as TableKind[]) {
  const values=data[kind];if(values===undefined)continue;
  if(!Array.isArray(values)){err(kind,0,kind,'Expected an array.');continue;}
  values.forEach((v,index)=>{if(!object(v))err(kind,index+1,'record','Expected an object.');else input.jsonRows.push({sourceId:source.id,table:kind,row:index+1,values:v});});
 }
 // Reviews/comments are separate application entities, not accepted as an unvalidated import shortcut.
 for(const key of ['reviews','comments'])if(key in data)err('document',0,key,'Review data cannot be imported through the hardware import format.');
}
export function previewImport(input:ImportInput,existing:HardwareProject=emptyProject()): Preview {
 const issues=[...input.issues,...input.tables.flatMap(t=>t.issues)];
 const sources=new Map(input.batch.sources.map(s=>[s.id,s]));
 const all:SourceRow[]=[...input.jsonRows];
 for(const t of input.tables) {
  input.batch.mappings[t.source.id]={...t.mapping};
  const mapped=Object.values(t.mapping).filter(Boolean);
  if(new Set(mapped).size!==mapped.length)issues.push({source:t.source.name,table:t.kind,row:1,field:'mapping',message:'One source column cannot map to multiple fields.'});
  for(const r of t.rows) {
   const values=Object.fromEntries(fields[t.kind].map(f=>[f,t.mapping[f]?r.values[t.mapping[f]]:'']));
   // Preserve unmapped fields separately through raw provenance and extra below.
   all.push({...r,values});
  }
 }
 const err=(r:SourceRow,field:string,message:string)=>issues.push({source:sources.get(r.sourceId)?.name||'',table:r.table,row:r.row,field,message});
 const val=(r:SourceRow,f:string,required=false):string=>{
  const v=r.values[f];if(v===undefined||v===null){if(required)err(r,f,'Required field is missing.');return '';}
  if(typeof v!=='string'){err(r,f,'Must be a string. Quote identifiers in JSON to preserve leading zeros.');return '';}
  if(required&&!v.trim())err(r,f,'Required field is empty.');
  if(['doorMark','hardwareSetId','itemId','ifcGlobalId'].includes(f)&&v!==v.trim())err(r,f,'Identifier has leading/trailing whitespace; correct it explicitly.');
  return v;
 };
 const appId=(r:SourceRow,suffix='')=>{const key=`${r.sourceId}:${r.table}:${r.row}:${suffix}`;if(!input.ids.has(key))input.ids.set(key,crypto.randomUUID());return input.ids.get(key)!;};
 const base=(r:SourceRow,suffix=''):ImportedRecord=>{
  const t=input.tables.find(t=>t.source.id===r.sourceId);
  const raw=t?.rows.find(x=>x.row===r.row)?.values||r.values;
  const known=t?new Set(Object.values(t.mapping).filter(Boolean)):new Set(fields[r.table]);
  return {id:appId(r,suffix),provenance:{batchId:input.batch.id,sourceId:r.sourceId,table:r.table,row:r.row,raw:structuredClone(raw)},extra:Object.fromEntries(Object.entries(raw).filter(([k])=>!known.has(k)))};
 };
 const next=structuredClone(existing), setMap=new Map(existing.hardwareSets.map(s=>[s.hardwareSetId,s.id])),doorMap=new Map(existing.doors.map(d=>[d.doorMark,d.id]));
 const duplicate=(rows:SourceRow[],field:string,previous:Set<string>)=>{
  const counts=new Map<string,number>();for(const r of rows){const v=val(r,field,true);counts.set(v,(counts.get(v)||0)+1);}
  for(const r of rows){const v=r.values[field];if(typeof v==='string'&&((counts.get(v)||0)>1||previous.has(v)))err(r,field,previous.has(v)?'Identifier already exists. Existing data will not be overwritten.':'Duplicate identifier in this import.');}
 };
 const setRows=all.filter(r=>r.table==='hardwareSets'),doorRows=all.filter(r=>r.table==='doors'),itemRows=all.filter(r=>r.table==='hardwareItems');
 duplicate(setRows,'hardwareSetId',new Set(setMap.keys()));duplicate(doorRows,'doorMark',new Set(doorMap.keys()));duplicate(itemRows,'itemId',new Set(existing.hardwareItems.map(i=>i.itemId)));
 for(const r of setRows){const hardwareSetId=val(r,'hardwareSetId',true);const s={...base(r),hardwareSetId,description:val(r,'description')};next.hardwareSets.push(s);setMap.set(hardwareSetId,s.id);}
 for(const r of doorRows){const doorMark=val(r,'doorMark',true);const d={...base(r),doorMark,ifcGlobalId:val(r,'ifcGlobalId'),modelIdentity:null,level:val(r,'level')};next.doors.push(d);doorMap.set(doorMark,d.id);}
 // Nonempty duplicate GlobalIds are ambiguous even if door marks differ.
 const globalRows=doorRows.filter(r=>typeof r.values.ifcGlobalId==='string'&&r.values.ifcGlobalId!=='');
 if(globalRows.length)duplicate(globalRows,'ifcGlobalId',new Set(existing.doors.map(d=>d.ifcGlobalId).filter(Boolean)));
 const setRef=(r:SourceRow)=>{const ref=val(r,'hardwareSetId',true);if(!setMap.has(ref))err(r,'hardwareSetId',`Hardware set "${ref}" does not exist. Import an explicit hardware-set definition first or in this batch.`);return setMap.get(ref)||'';};
 for(const r of itemRows){
  const q=r.values.quantity;const numeric=typeof q==='number'?q:typeof q==='string'&&/^\d+(\.\d+)?$/.test(q.trim())?Number(q):NaN;
  if(!Number.isFinite(numeric)||numeric<=0)err(r,'quantity','Quantity must be a finite number greater than zero (decimal notation).');
  next.hardwareItems.push({...base(r),itemId:val(r,'itemId',true),hardwareSetRecordId:setRef(r),quantity:numeric,unit:val(r,'unit'),category:val(r,'category'),manufacturer:val(r,'manufacturer'),productCode:val(r,'productCode'),description:val(r,'description'),finish:val(r,'finish'),notes:val(r,'notes')});
 }
 const assignmentRows=[...all.filter(r=>r.table==='assignments'),...doorRows.filter(r=>sources.get(r.sourceId)?.format==='csv'||(r.values.hardwareSetId!==undefined&&r.values.hardwareSetId!==null&&r.values.hardwareSetId!==''))];
 const assigned=new Set(existing.assignments.map(a=>a.doorRecordId)),pending=new Map<string,SourceRow[]>();
 for(const r of assignmentRows){
  const mark=val(r,'doorMark',true),doorRecordId=doorMap.get(mark)||'';if(!doorRecordId)err(r,'doorMark',`Door "${mark}" does not exist.`);
  if(assigned.has(doorRecordId))err(r,'doorMark','Door already has an assignment. Existing data will not be overwritten.');
  pending.set(mark,[...pending.get(mark)||[],r]);
  next.assignments.push({...base(r,'assignment'),doorRecordId,hardwareSetRecordId:setRef(r)});
 }
 for(const rows of pending.values())if(rows.length>1)for(const r of rows)err(r,'doorMark','Duplicate door assignment in this import.');
 if(!all.length)issues.push({source:'Import',table:'document',row:0,field:'records',message:'No records found.'});
 const counts={doors:next.doors.length-existing.doors.length,hardwareSets:next.hardwareSets.length-existing.hardwareSets.length,hardwareItems:next.hardwareItems.length-existing.hardwareItems.length,assignments:next.assignments.length-existing.assignments.length};
 next.revision=existing.revision+1;
 return {input,baseRevision:existing.revision,next,issues,counts,rows:all.map(r=>({table:r.table,row:r.row,source:sources.get(r.sourceId)!.name,values:r.values}))};
}
export function applyImport(preview:Preview,current:HardwareProject):HardwareProject {
 if(preview.issues.length)throw new Error('Import has validation errors. Nothing has been applied.');
 if(preview.baseRevision!==current.revision)throw new Error('Project changed after preview. Preview again before applying.');
 const next=structuredClone(preview.next);const batch=structuredClone(preview.input.batch);batch.importedAt=new Date().toISOString();next.imports.push(batch);return next;
}
