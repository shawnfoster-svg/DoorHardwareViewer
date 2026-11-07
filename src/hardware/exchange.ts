import {isHardwareProject,type HardwareProject} from './model';
import type {ModelSnapshot} from './exchange-model';
import {workflow} from './workflow';
export interface ReviewPackage {format:'dhv-review';packageVersion:1;exportedAt:string;ifcFileIncluded:false;instructions:string;modelIdentity:string|null;sourceFiles:ModelSnapshot['sourceFile'][];project:HardwareProject;}
export const fingerprint=async(data:ArrayBuffer)=>'sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).map(v=>v.toString(16).padStart(2,'0')).join('');
export function referencedModels(p:HardwareProject){const w=workflow(p);return [...new Set([...w.scopes,...w.bindings,...w.assignments,...w.reviews,...w.history].map(r=>r.modelIdentity))];}
/** Old backups contain associations but may lack a captured IFC inventory. Never invent one. */
export function catalogLegacy(p:HardwareProject):HardwareProject {
 const next=structuredClone(p);next.models??=[];
 for(const identity of referencedModels(next))if(!next.models.some(m=>m.identity===identity))next.models.push({identity,sourceFile:{name:'Source IFC required (legacy backup)',size:0,sha256:identity},ifcSchema:'unknown',capturedAt:new Date().toISOString(),doors:[],inventoryComplete:false});
 if(next.activeModelIdentity===undefined)next.activeModelIdentity=next.models.at(-1)?.identity||null;
 return next;
}
export function exportReview(p:HardwareProject):ReviewPackage {
 const project=catalogLegacy(p);if(!isHardwareProject(project))throw new Error('Review cannot be exported: invalid project or model identity.');
 return {format:'dhv-review',packageVersion:1,exportedAt:new Date().toISOString(),ifcFileIncluded:false,instructions:'IFC file NOT included. Reopen the original source IFC with the matching SHA-256 fingerprint. Opening another IFC never transfers assignments.',modelIdentity:project.activeModelIdentity||null,sourceFiles:project.models!.map(m=>m.sourceFile),project};
}
export function importReview(text:string):{project:HardwareProject;migration:string} {
 const value=JSON.parse(text);let project:unknown,migration='Review package v1; no schema conversion.';
 if(value?.format==='dhv-review'){
  if(value.packageVersion!==1)throw new Error('Unsupported review package version. No data changed.');
  if(value.ifcFileIncluded!==false)throw new Error('This reader supports explicitly excluded IFC files only.');
  if(typeof value.exportedAt!=='string'||typeof value.instructions!=='string'||!Array.isArray(value.sourceFiles))throw new Error('Incomplete package manifest.');
  project=value.project;
  if(!isHardwareProject(project))throw new Error('Invalid project graph or unsupported schema version.');
  if(value.modelIdentity!==(project.activeModelIdentity||null)||JSON.stringify(value.sourceFiles.map((f:ModelSnapshot['sourceFile'])=>[f.name,f.size,f.sha256]))!==JSON.stringify(project.models?.map(m=>[m.sourceFile.name,m.sourceFile.size,m.sourceFile.sha256])||[]))throw new Error('Manifest fingerprints disagree with project metadata.');
  const known=new Set(project.models?.map(m=>m.identity)||[]);if(referencedModels(project).some(id=>!known.has(id)))throw new Error('Package lacks a referenced model fingerprint.');
 }else{
  if(value?.schemaVersion!==1||!isHardwareProject(value))throw new Error('Expected a review package v1 or a valid legacy application backup v1. Hardware import examples are a different format.');
  project=catalogLegacy(value);migration='Legacy application backup v1 → review package v1. Missing IFC inventories stay unknown until the source IFC is reopened.';
 }
 if(!isHardwareProject(project))throw new Error('Invalid restored graph. No data changed.');return {project:structuredClone(project),migration};
}
