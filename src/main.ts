import './style.css';
import {ElementVisibilityUI} from './element-visibility';
import {ReviewUI} from './hardware/review-ui';
import { mountHardware } from './hardware/ui';
import { IfcAdapter, type ElementRecord } from './ifc-adapter';

const $ = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
document.querySelector('#app')!.innerHTML=`
<header><div><span class="eyebrow">DOOR HARDWARE VIEWER / PROTOTYPE 04</span><h1>Find the door. See the data.</h1></div><span class="badge">LOCAL IFC REVIEW</span></header>
<nav><label class="primary" for="file">Open IFC file</label><input id="file" type="file" accept=".ifc" hidden><button id="sample">Open example</button><span id="filename">No model open</span></nav>
<div id="status" role="status" aria-live="polite">Choose a local IFC file or explore the two-door example. Your model stays in this browser.</div>
<main><aside class="doors"><div class="panel-heading"><h2>Doors</h2><span id="count">0</span></div><label for="search">Search name, tag or GlobalId</label><input id="search" type="search" placeholder="e.g. D-101" disabled><label for="assignment-filter">Assignment</label><select id="assignment-filter"><option value="all">All assignments</option><option value="assigned">Assigned</option><option value="unassigned">Unassigned</option></select><label for="status-filter">Review status</label><select id="status-filter"><option value="all">All review statuses</option><option value="not-reviewed">Not reviewed</option><option value="in-review">In review</option><option value="accepted">Accepted</option><option value="changes-requested">Changes required</option></select><div class="table-scroll"><table><thead><tr><th>Tag</th><th>Name</th></tr></thead><tbody id="rows"></tbody></table><p id="empty">Open a model to list its IfcDoor elements.</p></div><p class="small">Select a row to highlight and focus a door. Gold marks the selected element.</p></aside>
<section class="viewport"><div class="toolbar"><button id="fit" disabled>Fit model</button><label for="visibility">View</label><select id="visibility" disabled><option value="all">All elements</option><option value="transparent">Transparent context</option><option value="doors">Doors only</option></select></div><div id="canvas" aria-label="Interactive IFC model"></div><div class="hint">Drag: orbit · Right drag: pan · Scroll: zoom · Click: inspect</div><div id="busy" hidden>Loading IFC…</div></section>
<aside class="inspector"><h2>Element inspector</h2><p id="inspect-hint">Select any rendered element to inspect its IFC information.</p><div id="details"></div></aside></main>
<footer>Source IFC stays unchanged. Manual review only. Hardware data imports save locally. Assignments and reviews are model-scoped. No automated compliance.</footer>`;
let viewer: IfcAdapter;
let reviewUI:ReviewUI|undefined;
let visibilityUI:ElementVisibilityUI|undefined;
let doors:ElementRecord[]=[],selected:string|null=null,busy=false,selectionVersion=0;
function message(text:string,error=false) {$('status').textContent=text;$('status').classList.toggle('error',error);$('status').setAttribute('role',error?'alert':'status');}
function renderRows() {
 const query=$<HTMLInputElement>('search').value.toLowerCase();
 const filtered=doors.filter(d=>{const badge=reviewUI?.badge(d);const assignment=$<HTMLSelectElement>('assignment-filter').value,status=$<HTMLSelectElement>('status-filter').value;return [d.name,d.tag,d.globalId||''].some(s=>s.toLowerCase().includes(query))&&(assignment==='all'||(assignment==='assigned')===!!badge?.assigned)&&(status==='all'||badge?.status===status);});
 $('rows').replaceChildren();
 for(const d of filtered) {
  const tr=document.createElement('tr');tr.dataset.doorKey=d.key; tr.classList.toggle('selected',d.key===selected);tr.setAttribute('aria-selected',String(d.key===selected));
  const td=document.createElement('td'),btn=document.createElement('button'); btn.textContent=d.tag||'(no tag)';btn.title=d.globalId||'Missing GlobalId';btn.onclick=()=>viewer.select(d.key);td.append(btn);
  const name=document.createElement('td');name.textContent=d.name||'(unnamed)';const badge=reviewUI?.badge(d);if(badge){const label=document.createElement('span');label.className=`table-badge ${badge.status}`;label.textContent=`${viewer.isHidden(d.key)?'Hidden · ':''}${badge.assigned?'Assigned':'Unassigned'} · ${badge.label}`;name.append(document.createElement('br'),label);}tr.append(td,name);tr.onclick=e=>{if(e.target!==btn)viewer.select(d.key);};$('rows').append(tr);
 }
 $('count').textContent=String(doors.length);
 $('empty').textContent=doors.length?'No doors match your search.':'No IfcDoor elements in this model.';$('empty').hidden=filtered.length>0;
}
function field(label:string,value:string) {const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value||'—';return [dt,dd];}
async function inspect(record:ElementRecord|null) {
 const version=++selectionVersion; selected=record?.key||null;
 if(record&&doors.some(d=>d.key===record.key)) {
  $<HTMLInputElement>('search').value='';$<HTMLSelectElement>('assignment-filter').value='all';$<HTMLSelectElement>('status-filter').value='all';
 }
 reviewUI?.select(record);visibilityUI?.select(record);
 renderRows();document.querySelector('tr.selected')?.scrollIntoView({block:'nearest'});
 $('details').replaceChildren();$('inspect-hint').textContent=record?'Loading properties…':'Select any rendered element to inspect its IFC information.';
 if(!record)return;
 const dl=document.createElement('dl');for(const [label,value] of [['IFC class',record.ifcClass],['GlobalId',record.globalId||'Missing'],['Name',record.name],['Tag',record.tag],['Model identity',record.modelIdentity]])dl.append(...field(label,value));$('details').append(dl);
 if(record.identityIssue){const warning=document.createElement('p');warning.className='error';warning.textContent=record.identityIssue;$('details').append(warning);}
 try {
  const data=await viewer.inspect(record.key);if(version!==selectionVersion)return;
  $('inspect-hint').textContent='Source IFC attributes and related properties';
  for(const [label,value] of [['Attributes',data.attributes],['Property sets (including types)',data.propertySets],['Type properties',data.typeProperties]]) {
   const detail=document.createElement('details');detail.open=label!=='Attributes';const summary=document.createElement('summary');summary.textContent=label as string;const pre=document.createElement('pre');pre.textContent=JSON.stringify(value,null,2);detail.append(summary,pre);$('details').append(detail);
  }
 }catch(e){if(version===selectionVersion)$('inspect-hint').textContent=`Property inspection failed: ${String(e)}`;}
}
function controls(loading:boolean,loaded:boolean) {
 busy=loading;$('busy').hidden=!loading;$('busy').textContent='Loading IFC…';
 for(const id of ['file','sample'])($ (id) as HTMLInputElement|HTMLButtonElement).disabled=loading;
 for(const id of ['search','fit','visibility'])($ (id) as HTMLInputElement|HTMLButtonElement).disabled=loading||!loaded;
 $('canvas').style.pointerEvents=loading?'none':'auto';
}
async function open(file:File) {
 if(busy)return;controls(true,false);visibilityUI?.select(null);reviewUI?.setModel([],'','');doors=[];selected=null;$<HTMLInputElement>('search').value='';selectionVersion++;$('details').replaceChildren();renderRows();
 try {
  const result=await viewer.open(file,s=>{message(s);$('busy').textContent=s;});doors=result.doors;reviewUI?.setModel(doors,result.identity,file.name);
  $('filename').textContent=file.name;$<HTMLSelectElement>('visibility').value='all';
  message(`${result.schema} · ${result.elementCount} rendered elements · ${doors.length} doors${result.unrenderedDoors?` · ${result.unrenderedDoors} doors have no supported geometry`:''}${doors.some(d=>d.identityIssue)?' · Warning: doors with invalid identities require review':''}`);
  renderRows();$('inspect-hint').textContent='Select a door or any rendered element.';controls(false,true);
 }catch(e){viewer.select(null);$('filename').textContent='No model open';message(`Unable to load IFC: ${e instanceof Error?e.message:String(e)} Try another uncompressed IFC file.`,true);controls(false,false);}
}
try {
 viewer=new IfcAdapter($('canvas'));reviewUI=new ReviewUI(viewer);visibilityUI=new ElementVisibilityUI(viewer,renderRows);reviewUI.onChange=renderRows;for(const id of ['assignment-filter','status-filter'])$(id).onchange=renderRows;viewer.onSelect=record=>{void inspect(record);};
 $<HTMLInputElement>('file').onchange=e=>{const input=e.target as HTMLInputElement;if(input.files?.[0])void open(input.files[0]);input.value='';};
 $('sample').onclick=async()=>{try{const r=await fetch(`${import.meta.env.BASE_URL}fixtures/two-doors.ifc`);if(!r.ok)throw new Error(`Example HTTP ${r.status}`);await open(new File([await r.blob()],'two-doors.ifc'));}catch(e){message(`Unable to open example: ${String(e)}`,true);}};
 $('search').oninput=renderRows;$('fit').onclick=()=>viewer.fit();$<HTMLSelectElement>('visibility').onchange=e=>viewer.setMode((e.target as HTMLSelectElement).value);
 window.addEventListener('pagehide',()=>viewer.dispose(),{once:true});
}catch(e){message(`The 3D viewer could not start. WebGL2 is required. ${String(e)}`,true);controls(false,false);$<HTMLInputElement>('file').disabled=true;$<HTMLButtonElement>('sample').disabled=true;}

mountHardware();
