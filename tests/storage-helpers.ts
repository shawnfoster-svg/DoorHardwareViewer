import type {Page} from '@playwright/test';
export async function readWorking(page:Page){return page.evaluate(async()=>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('door-hardware-review',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 return new Promise<any>((resolve,reject)=>{const r=db.transaction('working').objectStore('working').get('state');r.onsuccess=()=>{db.close();resolve(r.result?.project);};r.onerror=()=>reject(r.error);});
});}
export async function changeToken(page:Page){await page.evaluate(async()=>{
 const db=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open('door-hardware-review',1);r.onsuccess=()=>resolve(r.result);});await new Promise<void>(resolve=>{const tx=db.transaction('working','readwrite'),s=tx.objectStore('working'),r=s.get('state');r.onsuccess=()=>s.put({token:'another-tab',project:r.result?.project||{schemaVersion:1,revision:0,doors:[],hardwareSets:[],hardwareItems:[],assignments:[],reviews:[],comments:[],imports:[]}},'state');tx.oncomplete=()=>{db.close();resolve();};});
});}
