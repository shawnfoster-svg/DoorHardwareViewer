import {validWorkflow,type Workflow} from './workflow';
/** v1 keeps source identifiers distinct from stable, application-owned UUIDs. */
export interface Provenance { batchId: string; sourceId: string; table: string; row: number; raw: Record<string, unknown>; }
export interface ImportedRecord { id: string; provenance: Provenance; extra: Record<string, unknown>; }
export interface DoorSchedule extends ImportedRecord { doorMark: string; ifcGlobalId: string; modelIdentity: string | null; level: string; }
export interface HardwareSet extends ImportedRecord { hardwareSetId: string; description: string; }
export interface HardwareItem extends ImportedRecord { itemId: string; hardwareSetRecordId: string; quantity: number; unit: string; category: string; manufacturer: string; productCode: string; description: string; finish: string; notes: string; }
export interface Assignment extends ImportedRecord { doorRecordId: string; hardwareSetRecordId: string; }
export interface ReviewRecord { id: string; doorRecordId: string; status: 'not-reviewed'|'in-review'|'accepted'|'changes-requested'; modelIdentity?: string; ifcGlobalId?: string; }
export interface ReviewComment { id: string; reviewRecordId: string; text: string; createdAt: string; }
export interface Source { id: string; name: string; format: 'csv'|'json'; text: string; }
export interface ImportBatch { id: string; importedAt: string; sources: Source[]; mappings: Record<string, Record<string, string>>; extra: Record<string, unknown>; }
export interface HardwareProject { schemaVersion: 1; workflow?: Workflow; revision: number; doors: DoorSchedule[]; hardwareSets: HardwareSet[]; hardwareItems: HardwareItem[]; assignments: Assignment[]; reviews: ReviewRecord[]; comments: ReviewComment[]; imports: ImportBatch[]; }
export const emptyProject = (): HardwareProject => ({schemaVersion:1,revision:0,doors:[],hardwareSets:[],hardwareItems:[],assignments:[],reviews:[],comments:[],imports:[]});

/** Validate the saved application graph before trusting it, without repairing or overwriting it. */
export function isHardwareProject(value: unknown): value is HardwareProject {
 try {
  const p=value as HardwareProject;
  if(!p||p.schemaVersion!==1||!Number.isInteger(p.revision)||p.revision<0)return false;
  if(!['doors','hardwareSets','hardwareItems','assignments','reviews','comments','imports'].every(k=>Array.isArray(p[k as keyof HardwareProject])))return false;
  const obj=(v:unknown)=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const str=(v:unknown)=>typeof v==='string';
  const nonempty=(v:unknown)=>str(v)&&(v as string).trim().length>0;
  const records=[...p.doors,...p.hardwareSets,...p.hardwareItems,...p.assignments];
  const ids=new Set<string>();
  for(const r of [...records,...p.reviews,...p.comments,...p.imports]){if(!r||!nonempty(r.id)||ids.has(r.id))return false;ids.add(r.id);}
  const sources=new Set<string>(),batches=new Set(p.imports.map(b=>b.id));
  for(const b of p.imports){if(!str(b.importedAt)||!Array.isArray(b.sources)||!obj(b.mappings)||!obj(b.extra))return false;for(const s of b.sources){if(!s||!nonempty(s.id)||sources.has(s.id)||!str(s.name)||!str(s.text)||!['csv','json'].includes(s.format))return false;sources.add(s.id);}}
  for(const r of records)if(!obj(r.extra)||!r.provenance||!batches.has(r.provenance.batchId)||!sources.has(r.provenance.sourceId)||!str(r.provenance.table)||!Number.isInteger(r.provenance.row)||!obj(r.provenance.raw))return false;
  const unique=(v:string[])=>new Set(v).size===v.length;
  if(!p.doors.every(d=>nonempty(d.doorMark)&&str(d.ifcGlobalId)&&(d.modelIdentity===null||str(d.modelIdentity))&&str(d.level))||!unique(p.doors.map(d=>d.doorMark)))return false;
  if(!p.hardwareSets.every(s=>nonempty(s.hardwareSetId)&&str(s.description))||!unique(p.hardwareSets.map(s=>s.hardwareSetId)))return false;
  const sets=new Set(p.hardwareSets.map(s=>s.id)),doors=new Set(p.doors.map(d=>d.id));
  if(!p.hardwareItems.every(i=>nonempty(i.itemId)&&sets.has(i.hardwareSetRecordId)&&Number.isFinite(i.quantity)&&i.quantity>0&&[i.unit,i.category,i.manufacturer,i.productCode,i.description,i.finish,i.notes].every(str))||!unique(p.hardwareItems.map(i=>i.itemId)))return false;
  if(!p.assignments.every(a=>doors.has(a.doorRecordId)&&sets.has(a.hardwareSetRecordId))||!unique(p.assignments.map(a=>a.doorRecordId)))return false;
  if(!p.reviews.every(r=>doors.has(r.doorRecordId)&&['not-reviewed','in-review','accepted','changes-requested'].includes(r.status)))return false;
  const reviews=new Set(p.reviews.map(r=>r.id));
  return (p.workflow===undefined||validWorkflow(p.workflow,p)) && p.comments.every(c=>reviews.has(c.reviewRecordId)&&str(c.text)&&str(c.createdAt));
 }catch{return false;}
}
