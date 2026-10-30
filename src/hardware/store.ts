import {emptyProject,isHardwareProject,type HardwareProject} from './model';
export const STORAGE='dhv.hardware-project.v1';
export class HardwareStore extends EventTarget {
 project=emptyProject();stored:string|null=null;error='';
 constructor(){super();try{this.stored=localStorage.getItem(STORAGE);if(this.stored){const p=JSON.parse(this.stored);if(!isHardwareProject(p))throw new Error('Unsupported or damaged saved hardware data.');this.project=p;}}catch(e){this.error=`Saved data could not be read. Imports are blocked to protect it. ${String(e)}`;}}
 commit(next:HardwareProject){
  if(this.error)throw new Error(this.error);
  if(localStorage.getItem(STORAGE)!==this.stored)throw new Error('Saved hardware data changed in another tab. Reload before editing; nothing applied.');
  if(next.revision!==this.project.revision+1)throw new Error('Data changed. Preview again before applying.');
  if(!isHardwareProject(next))throw new Error('Invalid application graph; nothing saved.');
  const serialized=JSON.stringify(next);localStorage.setItem(STORAGE,serialized);this.project=next;this.stored=serialized;this.dispatchEvent(new Event('change'));
 }
}
export const hardwareStore=new HardwareStore();
