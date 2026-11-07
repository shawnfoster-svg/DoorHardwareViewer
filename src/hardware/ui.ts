import { addCsv,addJson,newInput,csvTable,previewImport,applyImport,fields,type ImportInput,type Preview,type TableKind } from './import';
import {exportReview} from './exchange';
import {hardwareStore} from './store';
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
function download(name:string,value:unknown) {
 const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function mountHardware() {
 let project=hardwareStore.project,storageError=hardwareStore.error,input:ImportInput|null=null,preview:Preview|null=null,readVersion=0;
 const launch=el('button','Hardware import');launch.id='hardware-open';document.querySelector('nav')!.append(launch);
 const dialog=el('dialog');dialog.className='hardware-dialog';dialog.setAttribute('aria-label','Hardware import');
 dialog.innerHTML=`<div class="hardware-title"><div><span class="eyebrow">HARDWARE DATA / V1</span><h2>Import, inspect, then apply.</h2></div><button id="hardware-close">Close</button></div>
 <p class="hardware-note">Import schedule data without changing your IFC. Sets can contain multiple items and serve multiple doors. Use Match schedule in the main viewer to associate imported doors with a confirmed IFC model.</p>
 <div id="hardware-saved" class="hardware-banner" role="status"></div>
 <div class="hardware-links">Download examples: <a download href="${import.meta.env.BASE_URL}templates/door-assignments.csv">Door assignments CSV</a><a download href="${import.meta.env.BASE_URL}templates/hardware-sets.csv">Hardware sets CSV</a><a download href="${import.meta.env.BASE_URL}templates/hardware-items.csv">Hardware items CSV</a><a download href="${import.meta.env.BASE_URL}templates/hardware-example.json">JSON example</a></div>
 <section class="hardware-source"><h3>1. Choose your source</h3><label for="import-format">Format</label><select id="import-format"><option value="csv">Separate CSV tables</option><option value="json">JSON package (schemaVersion 1)</option></select>
 <div id="csv-inputs"><label>Door assignments CSV<input id="doors-csv" type="file" accept=".csv"></label><label>Hardware sets CSV<input id="sets-csv" type="file" accept=".csv"></label><label>Hardware items CSV<input id="items-csv" type="file" accept=".csv"></label><p class="small">Choose one or more tables. New set identifiers require definitions in Hardware sets CSV or previously applied data. Door CSV can create schedule rows and assignments together.</p></div>
 <div id="json-inputs" hidden><label>JSON package<input id="hardware-json" type="file" accept=".json"></label></div>
 <button id="read-import">Read selected files</button> <button id="example-import">Load JSON example</button>
 </section><section><h3>2. Map CSV columns</h3><div id="import-mapping">Canonical headers map automatically. Unmapped source columns are preserved.</div><button id="preview-import" disabled>Validate & preview</button></section>
 <section><h3>3. Review import summary</h3><p id="import-message" role="status">Nothing staged. Existing data will never be overwritten.</p><div id="import-summary"></div><div id="import-errors"></div><div id="import-rows"></div><div class="hardware-actions"><button id="apply-import" disabled>Apply entire import</button><button id="export-report" disabled>Download staged report</button></div></section>
 <section><h3>Applied hardware data</h3><button id="export-project">Download data backup</button><div id="applied-hardware"></div></section>`;
 document.body.append(dialog);
 const $=<T extends HTMLElement>(id:string)=>dialog.querySelector<T>(`#${id}`)!;
 const msg=(s:string,error=false)=>{$('import-message').textContent=s;$('import-message').classList.toggle('error',error);};
 function saved(){
  $('hardware-saved').textContent=storageError||`${project.doors.length} schedule doors · ${project.hardwareSets.length} sets · ${project.hardwareItems.length} items · ${project.assignments.length} assignments. Applied data saves in this browser; export a backup for safekeeping.`;
  $('hardware-saved').classList.toggle('error',!!storageError);
  const host=$('applied-hardware');host.replaceChildren();
  for(const set of project.hardwareSets){
   const d=el('details');d.open=true;const assigned=project.assignments.filter(a=>a.hardwareSetRecordId===set.id);d.append(el('summary',`Set ${set.hardwareSetId} — ${set.description} (${assigned.length} doors)`));
   const marks=assigned.map(a=>project.doors.find(x=>x.id===a.doorRecordId)?.doorMark||'(unknown)');d.append(el('p',`Doors: ${marks.join(', ')||'Unassigned'}`));
   const table=el('table');const tr=el('tr');for(const t of ['Item','Qty','Unit','Description','Product','Finish'])tr.append(el('th',t));table.append(tr);
   for(const item of project.hardwareItems.filter(i=>i.hardwareSetRecordId===set.id)){const row=el('tr');for(const value of [item.itemId,String(item.quantity),item.unit,item.description,[item.manufacturer,item.productCode].filter(Boolean).join(' '),item.finish])row.append(el('td',value));table.append(row);}d.append(table);host.append(d);
  }
  const raw=el('details');raw.append(el('summary','All applied records, stable IDs, unknown fields and provenance'));raw.append(el('pre',JSON.stringify(project,null,2)));host.append(raw);
 }
 function invalidate(){preview=null;$<HTMLButtonElement>('apply-import').disabled=true;$<HTMLButtonElement>('export-report').disabled=!input;$('import-summary').replaceChildren();$('import-errors').replaceChildren();$('import-rows').replaceChildren();}
 function sourceChanged(){readVersion++;input=null;invalidate();$<HTMLButtonElement>('preview-import').disabled=true;$('import-mapping').textContent='Source changed. Read selected files again to create a new preview.';msg('Nothing applied. Read the selected files to continue.');}
 function mapping(){
  const host=$('import-mapping');host.replaceChildren();
  if(!input)return;
  if(!input.tables.length)host.append(el('p','JSON uses canonical field names; no column mapping is needed.'));
  for(const t of input.tables){const group=el('fieldset');group.append(el('legend',`${t.source.name} · ${t.kind}`));
   for(const field of fields[t.kind]){const label=el('label',field);const select=el('select');select.setAttribute('aria-label',`${t.kind}: ${field}`);const skip=el('option','Not mapped');skip.value='';select.append(skip);for(const h of t.headers){const option=el('option',h);option.value=h;select.append(option);}select.value=t.mapping[field];select.onchange=()=>{t.mapping[field]=select.value;invalidate();msg('Mapping changed. Validate again before applying.');};label.append(select);group.append(label);}host.append(group);
  }
  $<HTMLButtonElement>('preview-import').disabled=false;$<HTMLButtonElement>('export-report').disabled=false;
 }
 function showPreview(){
  if(!input)return;preview=previewImport(input,project);const p=preview;
  $('import-summary').replaceChildren(el('p',`Proposed additions: ${p.counts.doors} doors, ${p.counts.hardwareSets} sets, ${p.counts.hardwareItems} items, ${p.counts.assignments} assignments. Existing records replaced: 0.`));
  const errors=$('import-errors');errors.replaceChildren();
  if(p.issues.length){const list=el('ul');for(const issue of p.issues)list.append(el('li',`${issue.source} · ${issue.table} · row ${issue.row||'document'} · ${issue.field}: ${issue.message}`));errors.append(list);}
  const rows=$('import-rows');rows.replaceChildren();const table=el('table');const head=el('tr');for(const text of ['Source / table','Row','Mapped record','Validation'])head.append(el('th',text));table.append(head);
  for(const row of p.rows){const tr=el('tr');tr.append(el('td',`${row.source} / ${row.table}`),el('td',String(row.row)));const values=el('td');values.append(el('pre',JSON.stringify(row.values,null,2)));tr.append(values);const rowIssues=p.issues.filter(i=>i.source===row.source&&i.table===row.table&&i.row===row.row);tr.append(el('td',rowIssues.length?rowIssues.map(i=>`${i.field}: ${i.message}`).join(' '):'Valid'));tr.classList.toggle('invalid-row',rowIssues.length>0);table.append(tr);}rows.append(table);
  msg(p.issues.length?`${p.issues.length} validation errors. Nothing applied. Correct the source or mapping and preview again.`:'Validation passed. Review every proposed addition, then apply the entire import.',p.issues.length>0);
  $<HTMLButtonElement>('apply-import').disabled=!!p.issues.length||!!storageError;
 }
 launch.onclick=()=>dialog.showModal();$('hardware-close').onclick=()=>dialog.close();
 $('import-format').onchange=()=>{const csv=$<HTMLSelectElement>('import-format').value==='csv';$('csv-inputs').hidden=!csv;$('json-inputs').hidden=csv;sourceChanged();};
 for(const id of ['doors-csv','sets-csv','items-csv','hardware-json'])$(id).onchange=sourceChanged;
 $('read-import').onclick=async()=>{
  const version=++readVersion;input=null;invalidate();$<HTMLButtonElement>('preview-import').disabled=true;msg('Reading source files…');
  try{const candidate=newInput();
   if($<HTMLSelectElement>('import-format').value==='json'){const f=$<HTMLInputElement>('hardware-json').files?.[0];if(!f)throw new Error('Choose a JSON file.');addJson(candidate,f.name,await f.text());}
   else {for(const [id,kind] of [['doors-csv','doors'],['sets-csv','hardwareSets'],['items-csv','hardwareItems']] as [string,TableKind][]){const f=$<HTMLInputElement>(id).files?.[0];if(f)addCsv(candidate,csvTable(f.name,await f.text(),kind));}if(!candidate.tables.length)throw new Error('Choose at least one CSV file.');}
   if(version!==readVersion)return;input=candidate;mapping();msg('Sources staged. Check column mappings, then validate and preview.');
  }catch(e){if(version===readVersion)msg(String(e),true);}
 };
 $('example-import').onclick=async()=>{
  const version=++readVersion;input=null;invalidate();$<HTMLButtonElement>('preview-import').disabled=true;
  try{const r=await fetch(`${import.meta.env.BASE_URL}templates/hardware-example.json`);if(!r.ok)throw new Error(`Example HTTP ${r.status}`);const text=await r.text();if(version!==readVersion)return;input=newInput();addJson(input,'hardware-example.json',text);mapping();showPreview();}catch(e){if(version===readVersion)msg(String(e),true);}
 };
 $('preview-import').onclick=showPreview;
 $('apply-import').onclick=async()=>{
  if(!preview)return;
  try{
   const next=applyImport(preview,hardwareStore.project);await hardwareStore.commit(next);preview=null;$<HTMLButtonElement>('apply-import').disabled=true;saved();msg('Import applied and saved locally. No existing records were overwritten.');
  }catch(e){msg(`Nothing applied: ${String(e)}`,true);}
 };
 $('export-report').onclick=()=>{if(input)download('hardware-import-report.json',{schemaVersion:1,sources:input.batch.sources,mappings:Object.fromEntries(input.tables.map(t=>[t.source.id,t.mapping])),documentExtra:input.batch.extra,issues:preview?.issues||[],preview:preview?.rows||[],validated:!!preview});};
 $('export-project').onclick=()=>{try{download(storageError?'hardware-data-recovery.json':'hardware-review-package.json',storageError?{error:storageError,originalStoredText:hardwareStore.stored}:exportReview(project));}catch(e){msg(String(e),true);}};
 hardwareStore.addEventListener('change',()=>{project=hardwareStore.project;storageError=hardwareStore.error;saved();});
 saved();
}
