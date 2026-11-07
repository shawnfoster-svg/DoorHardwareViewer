import {hardwareStore as store} from './store';
import {refFor,assignmentFor,reviewFor,workflow,statusLabels,same,scopeSchedules,proposeMatches,applyExactMatches,resolveManually,unbindSchedule,setAssignment,setReviewStatus,addReviewComment,type ModelDoor,type MatchConfig,type MatchRow,type ReviewStatus} from './workflow';
import type {IfcAdapter,ElementRecord} from '../ifc-adapter';
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
export class ReviewUI {
 private commentDrafts=new Map<string,string>();
 private doors:ModelDoor[]=[];private identity='';private filename='';private selected:ModelDoor|null=null;
 private snapshot:ModelDoor[]=[];private proposals:MatchRow[]=[];private previewRevision=-1;private modelEpoch=0;
 private panel=el('section');private dialog=el('dialog');private markerLayer=el('div');private lastFrame=0;
 onChange:()=>void=()=>{};
 constructor(private viewer:IfcAdapter){
  this.panel.id='door-review';document.querySelector('.inspector')!.prepend(this.panel);
  const button=el('button','Match schedule');button.id='match-open';document.querySelector('nav')!.append(button);button.onclick=()=>{this.dialog.showModal();this.previewRevision=-1;this.renderQueue();};
  this.dialog.className='hardware-dialog';this.dialog.setAttribute('aria-label','Match schedule');
  this.dialog.innerHTML=`<div class="hardware-title"><h2>Associate schedule with IFC doors</h2><button id="match-close">Close</button></div><p id="match-model"></p><p>First confirm the model for unscoped schedules. Imported values stay unchanged. Matching never uses proximity. Existing assignments and bindings are protected.</p><button id="confirm-scope">Confirm unscoped schedules belong to this model</button><hr><label for="match-method">Matching method</label><select id="match-method"><option value="global-id">Exact IFC GlobalId</option><option value="door-mark">Exact door mark in selected IFC property</option></select><label for="match-property">IFC property used for door mark</label><select id="match-property"><option value="Attribute.Tag">Attribute.Tag</option><option value="Attribute.Name">Attribute.Name</option></select><p class="small">Exact, case-sensitive strings. Leading zeros and whitespace are not normalized. A conflicting imported GlobalId always requires manual resolution.</p><button id="preview-matches">Propose matches</button><button id="apply-matches" disabled>Apply safe exact matches</button><p id="match-message" role="status"></p><h3>Matching preview / resolution queue</h3><div id="match-queue"></div>`;
  document.body.append(this.dialog);this.$('match-close').onclick=()=>this.dialog.close();
  this.$('confirm-scope').onclick=()=>this.run(async()=>{if(!this.identity)throw new Error('Open an IFC model first.');const p=store.project,ids=p.doors.filter(d=>!d.modelIdentity&&!workflow(p).scopes.some(s=>s.scheduleDoorId===d.id)).map(d=>d.id);if(!ids.length)throw new Error('No unscoped schedules.');await store.commit(scopeSchedules(p,this.identity,ids));this.message(`Model scope confirmed for ${ids.length} schedule records. Propose matches next.`);});
  for(const id of ['match-method','match-property'])this.$(id).onchange=()=>{this.invalidate();};
  this.$('preview-matches').onclick=()=>{void this.propose();};
  this.$('apply-matches').onclick=()=>this.run(async()=>{if(!this.identity||this.previewRevision<0)throw new Error('Propose matches first.');const next=applyExactMatches(store.project,this.snapshot,this.identity,this.config(),this.previewRevision);const count=this.proposals.filter(r=>r.state==='ready').length;await store.commit(next);this.message(`${count} unique exact matches applied. Unresolved records remain in the queue.`);void this.propose();});
  this.markerLayer.id='door-markers';document.querySelector('.viewport')!.append(this.markerLayer);
  const markerLabel=el('label');markerLabel.append(el('span','Door markers '));const toggle=el('input');toggle.type='checkbox';toggle.id='markers-toggle';markerLabel.append(toggle);document.querySelector('.toolbar')!.append(markerLabel);toggle.onchange=()=>this.markers(true);
  store.addEventListener('change',()=>{this.invalidate();this.renderPanel();this.onChange();});
  viewer.onFrame=()=>{if(performance.now()-this.lastFrame>160){this.lastFrame=performance.now();this.markers();}};
  this.renderPanel();
 }
 private $<T extends HTMLElement>(id:string){return this.dialog.querySelector<T>(`#${id}`)!;}
 private config():MatchConfig{return {mode:this.$<HTMLSelectElement>('match-method').value as MatchConfig['mode'],property:this.$<HTMLSelectElement>('match-property').value};}
 private message(s:string,error=false){this.$('match-message').textContent=s;this.$('match-message').classList.toggle('error',error);}
 private async run(fn:()=>Promise<void>){try{await fn();}catch(e){this.message(String(e),true);}}
 private invalidate(){this.previewRevision=-1;this.proposals=[];this.$<HTMLButtonElement>('apply-matches').disabled=true;this.renderQueue();}
 setModel(doors:ElementRecord[],identity:string,filename:string){this.modelEpoch++;this.doors=doors;this.identity=identity;this.filename=filename;this.snapshot=[];this.selected=null;this.invalidate();this.$('match-model').textContent=identity?`${filename} · ${identity}`:'No IFC model open.';this.renderPanel();this.markers(true);}
 select(record:ElementRecord|null){this.selected=record?this.doors.find(d=>d.key===record.key)||null:null;this.renderPanel();this.markers(true);}
 badge(d:ModelDoor){if(!d.globalId||d.identityIssue)return {assigned:false,status:'not-reviewed' as ReviewStatus,label:'Identity unresolved'};const r=refFor(d);return {assigned:!!assignmentFor(store.project,r),status:reviewFor(store.project,r)?.status||'not-reviewed',label:statusLabels[reviewFor(store.project,r)?.status||'not-reviewed']};}
 private async propose(){
  const epoch=this.modelEpoch,revision=store.project.revision;this.previewRevision=-1;this.$<HTMLButtonElement>('apply-matches').disabled=true;
  try{if(!this.identity)throw new Error('Open an IFC model first.');this.message('Reading selected IFC properties…');const data=await this.viewer.matchingData();if(epoch!==this.modelEpoch||revision!==store.project.revision)throw new Error('Model or data changed. Propose matches again.');this.snapshot=data;const property=this.$<HTMLSelectElement>('match-property'),chosen=property.value;for(const key of new Set(data.flatMap(d=>Object.keys(d.values))))if(![...property.options].some(o=>o.value===key)){const opt=el('option',key);opt.value=key;property.append(opt);}property.value=chosen;this.proposals=proposeMatches(store.project,this.snapshot,this.identity,this.config());this.previewRevision=revision;const ready=this.proposals.filter(r=>r.state==='ready').length;this.$<HTMLButtonElement>('apply-matches').disabled=!ready||!!store.error;this.message(`${ready} safe exact matches. ${this.proposals.filter(r=>!['ready','bound'].includes(r.state)).length} records require resolution.`);this.renderQueue();}catch(e){this.message(String(e),true);}
 }
 private renderQueue(){
  const host=this.$('match-queue');host.replaceChildren();
  if(!this.proposals.length){host.append(el('p','Generate a matching preview for the current model.'));return;}
  const table=el('table'),head=el('tr');for(const h of ['Schedule / original identity','State / reason','Resolve explicitly'])head.append(el('th',h));table.append(head);
  for(const row of this.proposals){const tr=el('tr'),d=store.project.doors.find(d=>d.id===row.scheduleDoorId)!;tr.append(el('td',`${d.doorMark} · ${d.ifcGlobalId||'(no imported GlobalId)'}`),el('td',`${row.state}: ${row.reason}`));const cell=el('td');
   if(!['bound','wrong-model','unscoped'].includes(row.state)){
    const select=el('select');select.setAttribute('aria-label',`Resolve ${d.doorMark}`);const blank=el('option','Choose IFC door explicitly');blank.value='';select.append(blank);
    for(const target of this.doors.filter(t=>!t.identityIssue&&t.globalId)){const opt=el('option',`${target.tag||target.name||'(no mark)'} · ${target.globalId}`);opt.value=target.key;select.append(opt);}
    const focus=el('button','Inspect candidate');focus.onclick=()=>{if(select.value){this.viewer.select(select.value);this.dialog.close();}};
    const bind=el('button','Confirm manual link');bind.onclick=()=>this.run(async()=>{if(!select.value)throw new Error('Choose an IFC door by its GlobalId first.');await store.commit(resolveManually(store.project,this.doors,select.value,d.id));void this.propose();});cell.append(select,focus,bind);
   }
   tr.append(cell);table.append(tr);
  }host.append(table);
 }
 private renderPanel(){
  this.panel.replaceChildren(el('h2','Hardware & review'));const d=this.selected;
  if(!d){this.panel.append(el('p','Select an IFC door to assign hardware and record its review.'));return;}
  if(d.identityIssue||!d.globalId){this.panel.append(el('p','This door needs a unique IFC GlobalId before assignments or reviews can be saved.'));return;}
  const p=store.project,r=refFor(d),a=assignmentFor(p,r),review=reviewFor(p,r),binding=workflow(p).bindings.find(b=>same(b,r));
  const label=el('p',`${a?'Assigned':'Unassigned'} · ${statusLabels[review?.status||'not-reviewed']}`);label.className=`review-badge ${review?.status||'not-reviewed'}`;this.panel.append(label);
  this.panel.append(el('p',`Target: ${d.tag||d.name} · ${d.globalId}`));
  if(binding)this.panel.append(el('p',`Schedule ${p.doors.find(s=>s.id===binding.scheduleDoorId)?.doorMark} · Linked by ${binding.method} (${binding.property})`));
  const select=el('select');select.id='review-set';select.setAttribute('aria-label','Hardware set');const blank=el('option','Choose a hardware set');blank.value='';select.append(blank);for(const s of p.hardwareSets){const opt=el('option',`${s.hardwareSetId} — ${s.description}`);opt.value=s.id;select.append(opt);}select.value=a?.hardwareSetRecordId||'';this.panel.append(select);
  const feedback=el('p');feedback.id='review-message';feedback.setAttribute('role','status');
  const save=async(fn:()=>Promise<void>)=>{const controls=[...this.panel.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement|HTMLTextAreaElement>('button,input,select,textarea')].map(e=>({e,disabled:e.disabled}));for(const {e} of controls)e.disabled=true;try{await fn();}catch(e){const message=this.panel.querySelector<HTMLElement>('#review-message')||feedback;message.textContent=String(e);message.className='error';}finally{for(const {e,disabled} of controls)if(e.isConnected)e.disabled=disabled;}};
  const assign=el('button',a?'Reassign hardware set':'Assign hardware set');assign.id='review-assign';assign.disabled=!!store.error;assign.onclick=()=>save(async()=>{if(!select.value)throw new Error('Choose a hardware set.');await store.commit(setAssignment(p,d,select.value));});
  const remove=el('button','Remove assignment');remove.id='review-remove';remove.disabled=!a||!!store.error;remove.onclick=()=>save(async()=>await store.commit(setAssignment(p,d,null)));this.panel.append(assign,remove);if(binding){const unlink=el('button','Unlink schedule');unlink.onclick=()=>save(async()=>await store.commit(unbindSchedule(p,d)));this.panel.append(unlink);}
  if(a){const set=p.hardwareSets.find(s=>s.id===a.hardwareSetRecordId)!;this.panel.append(el('h3',`Assigned set ${set.hardwareSetId}`));for(const item of p.hardwareItems.filter(i=>i.hardwareSetRecordId===set.id)){const detail=el('details');detail.open=false;detail.append(el('summary',`${item.quantity} ${item.unit} · ${item.description||item.itemId}`));const dl=el('dl');for(const [field,value] of Object.entries(item).filter(([field])=>!['provenance','extra','id','hardwareSetRecordId'].includes(field))){dl.append(el('dt',field),el('dd',String(value)));}detail.append(dl);this.panel.append(detail);}}
  const status=el('select');status.id='review-status';status.setAttribute('aria-label','Review status');for(const [key,text] of Object.entries(statusLabels)){const opt=el('option',text);opt.value=key;status.append(opt);}status.value=review?.status||'not-reviewed';const saveStatus=el('button','Save status');saveStatus.id='review-save-status';saveStatus.onclick=()=>save(async()=>await store.commit(setReviewStatus(p,d,status.value as ReviewStatus)));this.panel.append(el('h3','Reviewer edits'),status,saveStatus);
  const draftKey=JSON.stringify([r.modelIdentity,r.ifcGlobalId]);const text=el('textarea');text.id='review-comment';text.value=this.commentDrafts.get(draftKey)||'';text.oninput=()=>this.commentDrafts.set(draftKey,text.value);text.setAttribute('aria-label','Review comment');text.placeholder='Record a review comment…';const add=el('button','Add comment');add.id='review-add-comment';add.onclick=()=>save(async()=>{const submitted=text.value;await store.commit(addReviewComment(p,d,submitted));if(this.commentDrafts.get(draftKey)===submitted)this.commentDrafts.delete(draftKey);this.renderPanel();});this.panel.append(text,add,feedback);
  for(const c of workflow(p).comments.filter(c=>c.reviewRecordId===review?.id))this.panel.append(el('p',`${c.createdAt} · ${c.text}`));
  const history=el('details');history.id='review-history';history.append(el('summary','Assignment and review history'));for(const h of workflow(p).history.filter(h=>same(h,r)))history.append(el('p',`${h.at} · ${h.kind} · ${h.method} · ${JSON.stringify(h.before)} → ${JSON.stringify(h.after)}`));this.panel.append(history);
  this.panel.append(el('hr'),el('h3','Source IFC information (unchanged)'));
 }
 private markers(force=false){
  const toggle=document.getElementById('markers-toggle') as HTMLInputElement;
  this.markerLayer.replaceChildren();if(!toggle?.checked||!this.identity)return;
  const visibleKeys=[...document.querySelectorAll<HTMLElement>('#rows tr[data-door-key]')].map(row=>row.dataset.doorKey!);
  if(this.selected)visibleKeys.unshift(this.selected.key);
  for(const point of this.viewer.markerLayout([...new Set(visibleKeys)])){
   const d=this.doors.find(d=>d.key===point.key)!;const badge=this.badge(d);const b=el('button',`${d.tag||d.name||'Door'} · ${badge.label}`);b.className=`door-marker ${badge.status}`;b.style.left=`${point.x}px`;b.style.top=`${point.y+54}px`;b.title=`${this.filename} · ${d.globalId||'invalid identity'} · ${badge.label}`;b.onclick=()=>this.viewer.select(d.key);this.markerLayer.append(b);
  }
 }
}
