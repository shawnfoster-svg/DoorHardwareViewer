export interface DoorSnapshot {globalId:string|null;name:string;tag:string;signature:string;identityIssue?:string;}
export interface ModelSnapshot {identity:string;inventoryComplete?:boolean;sourceFile:{name:string;size:number;sha256:string};ifcSchema:string;capturedAt:string;doors:DoorSnapshot[];}
export interface ReplacementRow {oldGlobalId:string;state:'unique'|'changed'|'missing'|'ambiguous'|'conflict'|'resolved';reason:string;candidateGlobalIds:string[];resolvedTo?:string;method?:'global-id'|'manual';resolvedAt?:string;}
export interface ReplacementPlan {id:string;fromIdentity:string;toIdentity:string;createdAt:string;rows:ReplacementRow[];}
