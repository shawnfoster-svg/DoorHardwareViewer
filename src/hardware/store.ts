import {emptyProject,isHardwareProject,type HardwareProject} from './model';
import {catalogLegacy} from './exchange';
export const STORAGE='dhv.hardware-project.v1'; // Read-only migration source; new writes use IndexedDB.
export const DB_NAME='door-hardware-review';
interface Stored {token:string;project:HardwareProject;}
export class HardwareStore extends EventTarget {
 project=emptyProject();stored:string|null=null;error='';file:File|null=null;busy=false;
 private db!:IDBDatabase;private token:string|null=null;
 readonly ready=this.initialize();
 private async initialize(){
  try{
   this.db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>request.result.createObjectStore('working');request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Close other viewer tabs so storage can open.'));request.onsuccess=()=>resolve(request.result);});
   this.db.onversionchange=()=>{this.db.close();this.error='Storage version changed in another tab. Reload the viewer.';this.dispatchEvent(new Event('change'));};
   const saved=await this.read<Stored>('state');
   if(saved){this.stored=JSON.stringify(saved.project);if(!saved.token||!isHardwareProject(saved.project))throw new Error('Unsupported or damaged IndexedDB review.');this.project=saved.project;this.token=saved.token;this.file=await this.read<File>('source')||null;}
   else{
    this.stored=localStorage.getItem(STORAGE);
    if(this.stored){const legacy=JSON.parse(this.stored);if(!isHardwareProject(legacy))throw new Error('Unsupported or damaged saved hardware data.');const next={...catalogLegacy(legacy),revision:legacy.revision+1};await this.write(next,undefined);try{localStorage.removeItem(STORAGE);}catch{/* Original copy may remain; IndexedDB is authoritative. */}}
   }
  }catch(e){this.error=`Saved data could not be read. Imports are blocked to protect it. ${String(e)}`;}
 }
 private read<T>(key:string):Promise<T|undefined>{return new Promise((resolve,reject)=>{const t=this.db.transaction('working','readonly'),r=t.objectStore('working').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 private async write(next:HardwareProject,file:File|null|undefined){
  if(!isHardwareProject(next))throw new Error('Invalid application graph; nothing saved.');
  const token=crypto.randomUUID();
  await new Promise<void>((resolve,reject)=>{
   const tx=this.db.transaction('working','readwrite',{durability:'strict'}),s=tx.objectStore('working'),read=s.get('state');let reason='';
   read.onsuccess=()=>{try{const current=read.result as Stored|undefined;if((current?.token||null)!==this.token){reason='Saved hardware data changed in another tab. Reload before editing; nothing applied.';tx.abort();return;}s.put({token,project:next} satisfies Stored,'state');if(file===null)s.delete('source');else if(file!==undefined)s.put(file,'source');}catch(e){reason=String(e);tx.abort();}};
   tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error(reason||tx.error?.message||'IndexedDB save aborted. Nothing applied.'));tx.onerror=()=>{};
  });
  this.project=next;this.token=token;if(file!==undefined)this.file=file;this.dispatchEvent(new Event('change'));
 }
 async commit(next:HardwareProject,file?:File|null){
  await this.ready;if(this.error)throw new Error(this.error);if(this.busy)throw new Error('A save is in progress. Try again when it completes.');if(next.revision!==this.project.revision+1)throw new Error('Data changed. Preview again before applying.');
  this.busy=true;try{await this.write(next,file);}finally{this.busy=false;}
 }
 async replace(project:HardwareProject,expectedRevision:number){if(this.project.revision!==expectedRevision)throw new Error('Working review changed. Preview package again.');const next=structuredClone(project);next.revision=this.project.revision+1;await this.commit(next,null);}
 async clear(expectedRevision:number){if(expectedRevision!==this.project.revision)throw new Error('Review changed; review the clear action again.');const next=emptyProject();next.revision=this.project.revision+1;await this.commit(next,null);try{localStorage.removeItem(STORAGE);}catch{}}
}
export const hardwareStore=new HardwareStore();
