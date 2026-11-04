import {readFile,writeFile,mkdir,lstat,appendFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export const hash=(value:unknown)=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export class EngineError extends Error {category:string;constructor(category:string,message:string){super(message);this.category=category;}}
export type Capability={id:string;owner:string;output:string;requires:string[];input_schema:{type:'object';required:string[]};acceptance:string[]};
export type Task=Capability&{status:string;attempt:number;input_hash?:string;artifact_hash?:string;decision?:string;candidate?:string};
export type Check={name:string;pass:boolean;detail?:unknown;error?:string};
export const splitCapabilities:Capability[]=[
 {id:'schema',owner:'schema_expert',output:'schema.sql',requires:['requirements'],input_schema:{type:'object',required:['requirements','dependencies']},acceptance:['no duplicate tables','expected columns, keys and relations','SQLite first apply','independent migration second apply']},
 {id:'validation',owner:'validation_expert',output:'validation.py',requires:['requirements'],input_schema:{type:'object',required:['requirements','dependencies']},acceptance:['Python syntax','three declared signatures','sandbox behavioral interface checks']},
 {id:'api',owner:'api_expert',output:'app.py',requires:['requirements','schema','validation'],input_schema:{type:'object',required:['requirements','dependencies']},acceptance:['Python syntax','all endpoint methods','module interfaces','ownership','all unchanged HTTP/SQLite acceptance tests']}
];
export const singleCapabilities:Capability[]=[{id:'single',owner:'single_expert',output:'app.py',requires:['requirements'],input_schema:{type:'object',required:['requirements','dependencies']},acceptance:['Python syntax','same endpoint methods','same SQLite schema and migration checks','all unchanged HTTP/SQLite acceptance tests']}];
export class ContractEngine {
 dir:string;tasks:Map<string,Task>;owners:Map<string,string>;artifacts:Record<string,string>={};ledger:any[]=[];repairs=0;maxRepairs:number;graphChanges:any[]=[];
 constructor(dir:string,capabilities:Capability[],maxRepairs=2){
  this.dir=dir;this.maxRepairs=maxRepairs;this.tasks=new Map();this.owners=new Map();
  for(const c of capabilities){if(this.tasks.has(c.id)||this.owners.has(c.output))throw new EngineError('duplicate_ownership',c.output);if(!['app.py','schema.sql','validation.py'].includes(c.output))throw new EngineError('unsafe_path',c.output);this.tasks.set(c.id,{...c,status:'pending',attempt:0});this.owners.set(c.output,c.owner);}
  for(const c of capabilities)for(const need of c.requires)if(need!=='requirements'&&!this.tasks.has(need))throw new EngineError('missing_dependency',need);
  const visit=(id:string,seen:Set<string>)=>{if(seen.has(id))throw new EngineError('dependency_cycle',id);const next=new Set(seen).add(id);for(const dep of this.tasks.get(id)!.requires)if(dep!=='requirements')visit(dep,next);};for(const c of capabilities)visit(c.id,new Set());
 }
 static async open(dir:string,capabilities:Capability[],maxRepairs=2){const engine=new ContractEngine(dir,capabilities,maxRepairs);await engine.restore();return engine;}
 async restore(){
  await mkdir(this.dir,{recursive:true});
  const config=join(this.dir,'engine-configuration.json'),definition=[...this.tasks.values()].map(({status,attempt,...t})=>t);
  try{if(hash(JSON.parse(await readFile(config,'utf8')))!==hash(definition))throw new EngineError('ledger_contract_mismatch','Capability definitions changed');}catch(e:any){if(e.code!=='ENOENT')throw e;await writeFile(config,JSON.stringify(definition,null,2));}
  let rows:any[]=[];try{rows=(await readFile(join(this.dir,'execution-ledger.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(x=>JSON.parse(x));}catch(e:any){if(e.code!=='ENOENT')throw new EngineError('ledger_corrupt',e.message);}
  this.ledger=rows;
  for(const row of rows){
   if(row.event==='retry_authorized'){this.repairs=Math.max(this.repairs,row.repair_number);this.tasks.get(row.task_id)!.decision=row.reason;}
   if(row.event==='graph_repair_node')this.graphChanges.push(row);
   const t=this.tasks.get(row.task_id);if(!t)continue;
   if(row.owner&&row.owner!==t.owner)throw new EngineError('ledger_contract_mismatch',t.id);
   if(['started','completed','rejected','failed'].includes(row.event)){t.status=row.event==='started'?'running':row.event==='completed'?'completed':'failed';t.attempt=row.attempt;t.input_hash=row.input_hash;if(row.event==='started')t.decision=undefined;}
   if(row.event==='completed')t.artifact_hash=row.artifact_hash;
   if(row.event==='invalidated'){t.status='invalidated';t.decision=undefined;}
  }
  for(const t of this.tasks.values()){
   if(t.artifact_hash){const text=await readFile(join(this.dir,'artifacts',t.output),'utf8');if(hash(text)!==t.artifact_hash)throw new EngineError('artifact_hash_mismatch',t.output);this.artifacts[t.output]=text;}
   if(t.attempt)try{t.candidate=await readFile(join(this.dir,'attempts',`${t.id}-${t.attempt}`,t.output),'utf8');}catch(e:any){if(e.code!=='ENOENT')throw e;}
   if(t.status==='running'){t.status='failed';await this.event('interrupted',{task_id:t.id,owner:t.owner,attempt:t.attempt,reason:'prior process ended before completion; explicit retry required'});}
  }
 }
 async event(event:string,value:any){const row={timestamp:new Date().toISOString(),event,...value};this.ledger.push(row);await mkdir(this.dir,{recursive:true});await appendFile(join(this.dir,'execution-ledger.jsonl'),JSON.stringify(row)+'\n');}
 ownerFor(artifact:string){const owner=this.owners.get(artifact);if(!owner)throw new EngineError('unknown_artifact',artifact);return owner;}
 routeFailure(artifact:string){const owner=this.ownerFor(artifact);return [...this.tasks.values()].find(t=>t.output===artifact&&t.owner===owner)!;}
 async retry(id:string,reason:string){const t=this.tasks.get(id);if(!t||!['failed','invalidated'].includes(t.status))throw new EngineError('retry_not_authorized',id);if(this.repairs>=this.maxRepairs)throw new EngineError('retry_limit','Global repair limit reached');this.repairs++;t.decision=reason;await this.event('retry_authorized',{task_id:id,owner:t.owner,reason,repair_number:this.repairs});}
 async invalidate(id:string,reason:string){const t=this.tasks.get(id);if(!t)throw new EngineError('unknown_task',id);t.status='invalidated';t.decision=undefined;await this.event('invalidated',{task_id:id,reason,preserved_artifact_hash:t.artifact_hash??null});for(const other of this.tasks.values())if(other.requires.includes(id)&&other.status==='completed')await this.invalidate(other.id,'dependency invalidated: '+id);}
 async begin(id:string,actor:string,input:any){
  const t=this.tasks.get(id);if(!t)throw new EngineError('unknown_task',id);if(actor!==t.owner)throw new EngineError('ownership_violation',`${actor} cannot write ${t.output}`);
  if(!input||typeof input!=='object'||Array.isArray(input)||t.input_schema.required.some(k=>!Object.hasOwn(input,k)))throw new EngineError('input_schema_violation',id);
  const input_hash=hash(input);
  if(t.status==='completed'){
   if(t.input_hash===input_hash){await this.event('cached_task',{task_id:id,input_hash,artifact_hash:t.artifact_hash});return {cached:true,task:t};}
   throw new EngineError('invalidation_required',id);
  }
  if(t.status==='running')throw new EngineError('duplicate_execution',id);
  for(const dep of t.requires)if(dep!=='requirements'&&this.tasks.get(dep)?.status!=='completed'){await this.event('blocked',{task_id:id,dependency:dep});throw new EngineError('dependency_incomplete',dep);}
  if(['failed','invalidated'].includes(t.status)&&!t.decision)throw new EngineError('retry_not_authorized',id);
  const decision=t.decision??'initial';t.decision=undefined;t.status='running';t.attempt++;t.input_hash=input_hash;
  await this.event('started',{task_id:id,capability:t.id,owner:actor,status:t.status,input_hash,attempt:t.attempt,decision});return {cached:false,task:t};
 }
 async complete(id:string,actor:string,source:string,checks:Check[]){
  const t=this.tasks.get(id);if(!t||t.status!=='running')throw new EngineError('not_running',id);if(actor!==this.ownerFor(t.output))throw new EngineError('ownership_violation',t.output);
  t.candidate=source;const artifact_hash=hash(source),attempt=join(this.dir,'attempts',`${id}-${t.attempt}`);await mkdir(attempt,{recursive:true});await writeFile(join(attempt,t.output),source,{mode:0o600});await writeFile(join(attempt,'validation.json'),JSON.stringify(checks,null,2));
  const passed=checks.length>0&&checks.every(c=>c.pass);
  if(passed){
   const out=join(this.dir,'artifacts');await mkdir(out,{recursive:true});try{if((await lstat(join(out,t.output))).isSymbolicLink())throw new EngineError('unsafe_path',t.output);}catch(e:any){if(e.code!=='ENOENT')throw e;}
   await writeFile(join(out,t.output),source,{mode:0o600});this.artifacts[t.output]=source;t.artifact_hash=artifact_hash;t.status='completed';
  }else t.status='failed';
  await this.event(passed?'completed':'rejected',{task_id:id,capability:t.id,owner:actor,status:t.status,input_hash:t.input_hash,artifact_hash,accepted_artifact_hash:t.artifact_hash??null,attempt:t.attempt,checks});return passed;
 }
 async fail(id:string,error:any){const t=this.tasks.get(id)!;t.status='failed';await this.event('failed',{task_id:id,owner:t.owner,attempt:t.attempt,input_hash:t.input_hash,category:error.category??'runtime_error',message:error.message});}
 dynamicNext(){return [...this.tasks.values()].find(t=>t.status==='failed'||t.status==='invalidated')??[...this.tasks.values()].find(t=>t.status==='pending'&&t.requires.every(d=>d==='requirements'||this.tasks.get(d)?.status==='completed'));}
 async repairNode(id:string,reason:string){const task=this.tasks.get(id)!;const node={id:`repair:${id}:${this.repairs+1}`,owner:task.owner,depends_on:id,reason};this.graphChanges.push(node);await this.event('graph_repair_node',node);return node;}
 async snapshot(){await writeFile(join(this.dir,'contract-state.json'),JSON.stringify({tasks:[...this.tasks.values()].map(({candidate,...t})=>t),owners:Object.fromEntries(this.owners),repairs:this.repairs,graphChanges:this.graphChanges},null,2));}
}
