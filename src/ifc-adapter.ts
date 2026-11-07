import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { IfcAPI, IFCDOOR } from 'web-ifc';
import wasmUrl from 'web-ifc/web-ifc.wasm?url';

export interface ElementRecord {
  modelIdentity: string; globalId: string | null; ifcClass: string;
  name: string; tag: string; key: string; identityIssue?: string;
}
export interface Inspection { record: ElementRecord; attributes: unknown; propertySets: unknown; typeProperties: unknown; }
/** Renderer/EXPRESS IDs never leave this adapter. key is session-only for invalid identities. */
export class IfcAdapter {
  private api = new IfcAPI();
  private initialized = false;
  private model: number | null = null;
  private ids = new Map<string, number>();
  private records = new Map<number, ElementRecord>();
  private meshes = new Map<number, THREE.Mesh[]>();
  private group = new THREE.Group();
  private selected: number | null = null;
  private doorIds = new Set<number>();
  private mode = 'all';
  private hiddenIds = new Set<number>();
  onVisibilityChange: () => void = () => {};
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, .01, 10000);
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;
  onFrame: () => void = () => {};
  onSelect: (record: ElementRecord | null) => void = () => {};
  private resize: ResizeObserver;
  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.append(this.renderer.domElement);
    this.scene.background = new THREE.Color('#dce5e9');
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x56616a, 3));
    const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(5, 12, 8); this.scene.add(light);
    this.scene.add(this.group);
    this.camera.position.set(10, 9, 12);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.resize = new ResizeObserver(() => {
      this.camera.aspect = container.clientWidth / container.clientHeight;
      this.camera.updateProjectionMatrix(); this.renderer.setSize(container.clientWidth, container.clientHeight);
    }); this.resize.observe(container);
    let start = new THREE.Vector2();
    this.renderer.domElement.addEventListener('pointerdown', e => { start.set(e.clientX, e.clientY); });
    this.renderer.domElement.addEventListener('pointerup', e => {
      if (e.button !== 0 || start.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 4) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1, -(e.clientY-rect.top)/rect.height*2+1), this.camera);
      const hit = ray.intersectObjects(this.group.children).find(h => h.object.visible);
      const id = hit?.object.userData.id as number | undefined;
      this.select(id === undefined ? null : this.records.get(id)!.key, false);
    });
    this.renderer.setAnimationLoop(() => { this.controls.update(); this.renderer.render(this.scene, this.camera); this.onFrame(); });
  }
  private clear() {
    if (this.model !== null) this.api.CloseModel(this.model);
    this.model = null;
    for (const list of this.meshes.values()) for (const mesh of list) {
      mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
    }
    this.group.clear(); this.hiddenIds.clear(); this.doorIds.clear(); this.meshes.clear(); this.records.clear(); this.ids.clear(); this.selected = null; this.onVisibilityChange();
  }
  async open(file: File, progress: (s: string) => void) {
    this.clear();
    progress('Reading file and calculating model identity…');
    const data = await file.arrayBuffer();
    const identity = 'sha256:' + Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data))).map(x => x.toString(16).padStart(2,'0')).join('');
    const header = new TextDecoder().decode(data.slice(0, 8192));
    if (!header.includes('ISO-10303-21') || !header.includes('FILE_SCHEMA')) throw new Error('This is not an IFC STEP file. Choose an uncompressed .ifc file.');
    if (!this.initialized) {
      progress('Initializing local IFC engine…');
      await this.api.Init(() => wasmUrl, true); this.initialized = true;
    }
    this.clear();
    try {
      progress('Parsing IFC and generating geometry…');
      await new Promise(r => setTimeout(r, 30));
      this.model = this.api.OpenModel(new Uint8Array(data), { COORDINATE_TO_ORIGIN: true });
      if (this.model < 0) { this.model = null; throw new Error('The IFC engine could not open this model.'); }
      const schema = this.api.GetModelSchema(this.model);
      if (!schema) throw new Error('Unsupported or malformed IFC schema. Expected IFC2X3, IFC4 or IFC4X3.');
      const all = this.api.GetAllLines(this.model);
      const counts = new Map<string, number>();
      for (let i=0;i<all.size();i++) {
        const id=all.get(i), line=this.api.GetLine(this.model,id);
        if (!line || !('GlobalId' in line)) continue;
        const globalId = line.GlobalId?.value || null;
        if(globalId) counts.set(globalId,(counts.get(globalId)||0)+1);
        this.records.set(id, {modelIdentity:identity, globalId, ifcClass:this.api.GetNameFromTypeCode(line.type), name:line.Name?.value || '', tag:line.Tag?.value || '', key:crypto.randomUUID()});
      }
      for (const [id, record] of this.records) {
        if(!record.globalId) record.identityIssue='Missing GlobalId; cannot persist associations';
        else if(counts.get(record.globalId)! > 1) record.identityIssue='Duplicate GlobalId; cannot persist associations';
        else record.key=record.globalId;
        this.ids.set(record.key,id);
      }
      this.api.StreamAllMeshes(this.model, flat => {
        if (!this.records.has(flat.expressID)) return;
        const list: THREE.Mesh[]=[];
        for(let i=0;i<flat.geometries.size();i++) {
          const placed=flat.geometries.get(i), geom=this.api.GetGeometry(this.model!, placed.geometryExpressID);
          const vertices=this.api.GetVertexArray(geom.GetVertexData(),geom.GetVertexDataSize());
          const indices=this.api.GetIndexArray(geom.GetIndexData(),geom.GetIndexDataSize());
          const positions=new Float32Array(vertices.length/2), normals=new Float32Array(vertices.length/2);
          for(let v=0;v<vertices.length/6;v++) { positions.set(vertices.subarray(v*6,v*6+3),v*3); normals.set(vertices.subarray(v*6+3,v*6+6),v*3); }
          const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.BufferAttribute(positions,3)); geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3)); geometry.setIndex(new THREE.BufferAttribute(indices.slice(),1));
          const c=placed.color;
          const material=new THREE.MeshStandardMaterial({color:new THREE.Color(c.x,c.y,c.z),side:THREE.DoubleSide,roughness:.8});
          const mesh=new THREE.Mesh(geometry,material); mesh.applyMatrix4(new THREE.Matrix4().fromArray(placed.flatTransformation));
          mesh.userData={id:flat.expressID,color:material.color.clone()}; this.group.add(mesh); list.push(mesh); geom.delete();
        }
        this.meshes.set(flat.expressID,list);
      });
      if (!this.group.children.length) throw new Error('No supported renderable elements were found in this IFC.');
      const doorIds=this.api.GetLineIDsWithType(this.model,IFCDOOR,true);
      const doors: ElementRecord[]=[];
      for(let i=0;i<doorIds.size();i++) {
        const id=doorIds.get(i); this.doorIds.add(id); let r=this.records.get(id);
        if(!r) {
          const line=this.api.GetLine(this.model,id);
          r={modelIdentity:identity,globalId:null,ifcClass:'IFCDOOR',name:line.Name?.value||'',tag:line.Tag?.value||'',key:crypto.randomUUID(),identityIssue:'Missing GlobalId; cannot persist associations'};
          this.records.set(id,r);this.ids.set(r.key,id);
        }
        doors.push(r);
      }
      this.mode='all'; this.visibility(); this.fit();
      return {identity,schema,doors,elementCount:this.meshes.size,unrenderedDoors:doors.filter(d=>!this.meshes.has(this.ids.get(d.key)!)).length};
    } catch(e) { this.clear(); throw e; }
  }
  select(key: string | null, focus=true) {
    const id=key === null ? undefined : this.ids.get(key);
    this.selected=id ?? null; this.visibility();
    if (id !== undefined && focus) this.fit(key!);
    this.onSelect(id === undefined ? null : this.records.get(id)!);
  }
  async inspect(key: string): Promise<Inspection> {
    const id=this.ids.get(key); if(id===undefined || this.model===null) throw new Error('Element is no longer available.');
    const model=this.model;
    return {record:this.records.get(id)!,attributes:this.api.GetLine(model,id,true),propertySets:[...await this.api.properties.getPropertySets(model,id,true,false), ...await this.api.properties.getPropertySets(model,id,true,true)],typeProperties:await this.api.properties.getTypeProperties(model,id,true)};
  }
  async matchingData() {
    const model=this.model;if(model===null)return [];
    const result:(ElementRecord&{values:Record<string,string[]>})[]=[];
    for(const id of this.doorIds){
      if(this.model!==model)throw new Error('Model changed while reading matching properties.');
      const record=this.records.get(id)!;
      const values:Record<string,string[]>=Object.create(null);
      const add=(path:string,value:unknown)=>{if(typeof value==='string'||typeof value==='number'){(values[path]??=[]).push(String(value));}};
      const line=this.api.GetLine(model,id);
      for(const [name,value] of Object.entries(line))if(value&&typeof value==='object'&&'value' in value)add(`Attribute.${name}`,(value as {value:unknown}).value);
      const sets=[...await this.api.properties.getPropertySets(model,id,true,false),...await this.api.properties.getPropertySets(model,id,true,true)];
      for(const set of sets)for(const property of set.HasProperties||[])add(`${set.Name?.value}.${property.Name?.value}`,property.NominalValue?.value);
      result.push({...record,values});
    }
    if(this.model!==model)throw new Error('Model changed while reading matching properties.');
    return result;
  }
  async modelSnapshot(identity:string,file:File,ifcSchema:string) {
    const data=await this.matchingData();
    const entries=[];
    for(const d of data){
      const parts=(this.meshes.get(this.ids.get(d.key)!)||[]).map(mesh=>({position:Array.from(mesh.geometry.getAttribute('position').array),index:Array.from(mesh.geometry.index?.array||[]),transform:mesh.matrix.toArray()}));
      const payload=JSON.stringify({name:d.name,tag:d.tag,values:d.values,parts});
      const bytes=new TextEncoder().encode(payload),digest=await crypto.subtle.digest('SHA-256',bytes);
      const signature='sha256:'+Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
      entries.push({globalId:d.globalId,name:d.name,tag:d.tag,identityIssue:d.identityIssue,signature});
    }
    return {identity,inventoryComplete:true,sourceFile:{name:file.name,size:file.size,sha256:identity},ifcSchema,capturedAt:new Date().toISOString(),doors:entries};
  }
  markerLayout(keys:string[]) {
    this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld(true);
    const result:{key:string;x:number;y:number}[]=[];
    const visible=this.group.children.filter(o=>o.visible);
    for(const key of keys.slice(0,100)){
      const id=this.ids.get(key);if(id===undefined)continue;
      const bounds=new THREE.Box3();for(const mesh of this.meshes.get(id)||[])if(mesh.visible)bounds.expandByObject(mesh);
      if(bounds.isEmpty())continue;
      const center=bounds.getCenter(new THREE.Vector3()),ndc=center.clone().project(this.camera);
      if(ndc.z< -1||ndc.z>1||Math.abs(ndc.x)>.94||Math.abs(ndc.y)>.94)continue;
      const direction=center.clone().sub(this.camera.position),distance=direction.length();
      const ray=new THREE.Raycaster(this.camera.position,direction.normalize(),0,distance);
      const hit=ray.intersectObjects(visible)[0];if(hit&&hit.object.userData.id!==id)continue;
      const x=(ndc.x+1)/2*this.container.clientWidth,y=(1-ndc.y)/2*this.container.clientHeight;
      if(result.some(p=>Math.abs(p.x-x)<170&&Math.abs(p.y-y)<32))continue;
      result.push({key,x,y});
    }
    return result;
  }
  canHide(key:string) {const id=this.ids.get(key);return id!==undefined&&!!this.meshes.get(id)?.length;}
  isHidden(key:string) {const id=this.ids.get(key);return id!==undefined&&this.hiddenIds.has(id);}
  hiddenElements():ElementRecord[] {return [...this.hiddenIds].map(id=>({...this.records.get(id)!}));}
  setHidden(key:string,hidden:boolean) {
    const id=this.ids.get(key);if(id===undefined||!this.canHide(key))return;
    if(hidden)this.hiddenIds.add(id);else this.hiddenIds.delete(id);
    this.visibility();this.onVisibilityChange();
  }
  unhideAll() {this.hiddenIds.clear();this.visibility();this.onVisibilityChange();}
  setMode(mode:string) {this.mode=mode;this.visibility();}
  private visibility() {
    for(const [id,list] of this.meshes) for(const mesh of list) {
      const door=this.doorIds.has(id), selected=id===this.selected;
      mesh.visible=!this.hiddenIds.has(id)&&(this.mode!=='doors'||door||selected);
      const mat=mesh.material as THREE.MeshStandardMaterial;
      mat.color.copy(selected ? new THREE.Color('#f3ad26') : mesh.userData.color);
      mat.transparent=this.mode==='transparent'&&!door&&!selected; mat.opacity=mat.transparent?.15:1; mat.depthWrite=!mat.transparent;
    }
  }
  fit(key?:string) {
    const bounds=new THREE.Box3();
    const list=key ? this.meshes.get(this.ids.get(key)!) || [] : this.group.children;
    for(const object of list) if(object.visible)bounds.expandByObject(object);
    if(bounds.isEmpty()) return;
    const center=bounds.getCenter(new THREE.Vector3()), radius=Math.max(bounds.getSize(new THREE.Vector3()).length()/2,.3);
    const distance=radius/Math.sin(Math.atan(Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))*Math.min(1,this.camera.aspect)))*1.2;
    const direction=this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(center); this.camera.position.copy(center).addScaledVector(direction,distance);
    this.camera.near=Math.max(distance/10000,.001);this.camera.far=Math.max(distance*100,1000);this.camera.updateProjectionMatrix();this.controls.update();
  }
  close() {this.clear();}
  dispose() { this.clear();this.resize.disconnect();this.controls.dispose();this.renderer.setAnimationLoop(null);this.renderer.dispose(); }
}
