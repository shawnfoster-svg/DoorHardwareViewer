import type {IfcAdapter,ElementRecord} from './ifc-adapter';
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
/** View-only state lives in the adapter for the current model session. */
export class ElementVisibilityUI {
 private selected:ElementRecord|null=null;
 private panel=el('section');
 constructor(private viewer:IfcAdapter,onChange:()=>void){
  this.panel.id='element-visibility';document.querySelector('.inspector')!.prepend(this.panel);
  viewer.onVisibilityChange=()=>{this.render();onChange();};this.render();
 }
 select(record:ElementRecord|null){this.selected=record;this.render();}
 private render(){
  const host=this.panel;host.replaceChildren(el('h2','Element visibility'));
  const r=this.selected;
  const toggle=el('button',r&&this.viewer.isHidden(r.key)?'Unhide selected element':'Hide selected element');toggle.id='toggle-element-visibility';toggle.disabled=!r||!this.viewer.canHide(r.key);
  toggle.onclick=()=>{if(r)this.viewer.setHidden(r.key,!this.viewer.isHidden(r.key));};host.append(toggle);
  const state=el('p',r?`${r.ifcClass} · ${r.tag||r.name||r.globalId||'(unnamed)'}${this.viewer.isHidden(r.key)?' · Hidden':''}`:'Click an IFC element to hide it.');state.id='selected-element-visibility';state.setAttribute('role','status');host.append(state);
  const hidden=this.viewer.hiddenElements();const detail=el('details');detail.id='hidden-elements';detail.open=hidden.length>0;detail.append(el('summary',`Hidden elements (${hidden.length})`));
  const list=el('ul');
  for(const record of hidden){const row=el('li');row.append(el('span',`${record.ifcClass} · ${record.tag||record.name||'(unnamed)'} · ${record.globalId||'No GlobalId'}`));const button=el('button','Unhide');button.title=`Unhide ${record.ifcClass} ${record.globalId||record.name}`;button.onclick=()=>this.viewer.setHidden(record.key,false);row.append(button);list.append(row);}
  detail.append(list);const all=el('button','Unhide all');all.id='unhide-all';all.disabled=!hidden.length;all.onclick=()=>this.viewer.unhideAll();detail.append(all);host.append(detail);
  host.append(el('p','Hiding affects this viewing session only. Unhide restores the element subject to the current View mode.'));
 }
}
