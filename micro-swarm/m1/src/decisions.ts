import type {Question} from './provider.ts';import type {IR,Entity,Field,Rule,Operation,Expr} from './ir.ts';
export type Node={id:string;role:string;type:'choice'|'noul';value:any;dependencies:string[];requirement_source:string;status:string;answer?:any;call_id?:string;model?:string};
export class DecisionGraph{
 nodes:Node[]=[];unresolved:any[]=[];roles:any[]=[];
 add(node:Node){if(this.nodes.some(n=>n.id===node.id))throw new Error('Duplicate decision '+node.id);if(node.dependencies.some(d=>!this.nodes.some(n=>n.id===d)))throw new Error('Unresolved decision dependency '+node.id);if(node.value==='unsupported'){node.status='unresolved';this.unresolved.push({decision:node.id,reason:'unsupported selection'});}this.nodes.push(node);}
}
type Spec={id:string;instructions:string;options?:Record<string,{description:string;value:any}>;type:'choice'|'noul'};
const choice=(id:string,instructions:string,options:Record<string,any>):Spec=>({id,instructions,type:'choice',options:Object.fromEntries(Object.entries({...options,unsupported:'unsupported'}).map(([k,v])=>[k,{value:v,description:typeof v==='string'?v:JSON.stringify(v)}]))});
const yes=(id:string,instructions:string):Spec=>({id,instructions,type:'noul'});
const ref=(s:string):Expr=>({ref:s});const calc=(op:any,a:Expr,b:Expr):Expr=>({calc:op,args:[a,b]});
export async function synthesize(input:any,requirements:string,decide:(state:any,q:Record<string,Question>,role:string)=>Promise<any>,graphSink:(graph:DecisionGraph)=>Promise<void>=async()=>{}){
 const graph=new DecisionGraph();let previousRoleIds:string[]=[];
 async function ask(role:string,specs:Spec[],context:any={}){
  const out:Record<string,any>={};const roleIds:string[]=[];
  for(let i=0;i<specs.length;i+=32){
   const batch=specs.slice(i,i+32);const questions:Record<string,Question>={};
   for(const s of batch)questions[s.id]=s.type==='noul'?{type:'noul',instructions:s.instructions,criteria:{true:'The statement is required by the supplied requirements.',false:'The statement is not required by the supplied requirements.'}}:{type:'choice',instructions:s.instructions,criteria:Object.fromEntries(Object.entries(s.options!).map(([k,v])=>[k,v.description]))};
   const result=await decide({requirements,context,symbol_source:input.symbol_source},questions,role);
   for(const s of batch){const answer=result.decisions[s.id];if(!answer)throw new Error('Missing role answer '+s.id);const value=s.type==='noul'?answer.value:s.options![answer.value]?.value;if(value===undefined)throw new Error('Answer outside candidate set');out[s.id]=value;graph.add({id:s.id,role,type:s.type,value,dependencies:previousRoleIds,requirement_source:'benchmarks/requirements.txt + human public symbol dictionary',status:'resolved',answer,call_id:result.id,model:result.model});roleIds.push(s.id);}
   await graphSink(graph);
  }
  graph.roles.push({role,decision_ids:roleIds,status:'completed'});previousRoleIds=roleIds.length?roleIds:previousRoleIds;await graphSink(graph);return out;
 }
 const es=await ask('Entity',input.entities.map((e:any)=>yes('entity_'+e.name,`Does '${e.name}' denote a persisted conceptual entity required by this API?`)),{candidates:input.entities});
 const symbols=input.entities.filter((e:any)=>es['entity_'+e.name]);
 if(!symbols.length){graph.unresolved.push({role:'Entity',reason:'No persisted entity selected'});return {ir:null,graph};}
 const fs:Spec[]=[];
 for(const e of symbols){fs.push(choice('pk_'+e.name,`Select the unique integer record identity field of ${e.name}.`,Object.fromEntries([...e.fields.map((f:string)=>[f,f]),['unsupported','unsupported']])));for(const f of e.fields){fs.push(choice('type_'+e.name+'_'+f,`Choose the persisted data type of ${e.name}.${f}.`,{integer:'integer',text:'text',boolean:'boolean',unsupported:'unsupported'}));fs.push(yes('required_'+e.name+'_'+f,`Must ${e.name}.${f} contain a non-null value in each persisted record (including values supplied by the server)?`));}}
 const fd=await ask('Field',fs,{entities:symbols});
 const entities:Entity[]=symbols.map((e:any)=>({name:e.name,fields:e.fields.map((f:string)=>({name:f,type:fd['type_'+e.name+'_'+f],required:fd['required_'+e.name+'_'+f],primary:fd['pk_'+e.name]===f,unique:false}))}));
 const rs:Spec[]=[];for(const e of entities)for(const f of e.fields)if(f.name.endsWith('_id')&&!f.primary)rs.push(choice('relation_'+e.name+'_'+f.name,`Does ${e.name}.${f.name} reference another entity's record identity? Select its target or none.`,Object.fromEntries([['none',null],...entities.map(t=>[t.name,t.name])])));
 const rd=await ask('Relationship',rs,{entities});const relationships:any[]=[];
 for(const e of entities)for(const f of e.fields){const target=rd['relation_'+e.name+'_'+f.name];if(target){const pk=entities.find(t=>t.name===target)?.fields.find(f=>f.primary)?.name;if(pk)relationships.push({entity:e.name,field:f.name,target,target_field:pk});else graph.unresolved.push({decision:'relation_'+e.name+'_'+f.name,reason:'Target identity unresolved'});}}
 const profiles:Record<string,any>={};
 const plain={trim:false,min:null,max:null,min_length:null,max_length:null,pattern:null};profiles.unbounded={...plain};
 const numbers=input.literals.numbers as number[];for(const low of [0,1])for(const high of [null,...numbers.filter(n=>n>1)])profiles['int_'+low+'_'+high]={...plain,min:low,max:high};
 for(const high of numbers.filter(n=>n>1))for(const trim of [true,false])profiles['text_'+trim+'_'+high]={...plain,trim,min_length:1,max_length:high};
 for(let i=0;i<input.literals.patterns.length;i++){const pattern=input.literals.patterns[i];profiles['pattern_'+i]={...plain,pattern};}
 const cs:Spec[]=[];for(const e of entities)for(const f of e.fields){const key=e.name+'_'+f.name;cs.push(yes('unique_'+key,`Must ${e.name}.${f.name} be globally unique within this table? Distinguish an idempotency key from a foreign key.`));let opts=Object.fromEntries(Object.entries(profiles).filter(([k])=>k==='unbounded'||(f.type==='integer'?k.startsWith('int_'):f.type==='text'?k.startsWith('text_')||k.startsWith('pattern_'):false)));cs.push(choice('rule_'+key,`Select the required input validation rule for ${e.name}.${f.name}. Integer bounds reject booleans; regex patterns imply full-string matching. Choose unbounded if the requirements give no value bound for this field.`,opts));}
 const cd=await ask('Constraint',cs,{entities,relationships});const rules:Record<string,any>={};
 for(const e of entities)for(const f of e.fields){const key=e.name+'_'+f.name;f.unique=cd['unique_'+key];rules[e.name+'.'+f.name]={name:f.name,type:f.type,required:f.required,...cd['rule_'+key]};}
 const os:Spec[]=[];input.routes.forEach((r:any,i:number)=>{os.push(choice('kind_'+i,`Select the semantic operation for ${r.method} ${r.path}: create=independent insert; guarded_create=insert plus a conditional modification of a related record; list=collection read; get=identity read; transition=state change of an existing record.`,{create:'create',guarded_create:'guarded_create',list:'list',get:'get',transition:'transition',unsupported:'unsupported'}));os.push(choice('target_'+i,`Which persisted entity is returned/created/transitioned by ${r.method} ${r.path}?`,Object.fromEntries(entities.map(e=>[e.name,e.name]))));});
 const od=await ask('Operation',os,{entities,relationships,routes:input.routes});const operations:Operation[]=input.routes.map((r:any,i:number)=>({id:'op_'+i,kind:od['kind_'+i],entity:od['target_'+i],atomic:false,input:{fields:[],exact:true},success_status:0,response_fields:[],values:{},lookups:[],guards:[],effects:[],idempotency:null,key:null,order:[],transition:null}));
 // Second bounded Operation pass binds values. Structure is generic; all bindings are model selections.
 const bindings:Spec[]=[];
 for(let i=0;i<operations.length;i++){
  const o=operations[i],route=input.routes[i],e=entities.find(e=>e.name===o.entity)!;const label=route.method+' '+route.path;
  if(['create','guarded_create'].includes(o.kind))for(const f of e.fields.filter(f=>!f.primary)){
   const options:Record<string,any>={omit:null};for(const key of route.body)options['input_'+key]=ref('input.'+key);for(let n=0;n<input.literals.strings.length;n++)options['literal_'+n]={lit:input.literals.strings[n]};options.zero={lit:0};options.one={lit:1};bindings.push(choice('value_'+i+'_'+f.name,`For ${label}, select the value source of created ${e.name}.${f.name}. A server-controlled state is a literal, not an undeclared request property.`,options));
  }
  if(o.kind==='list'){bindings.push(choice('order_'+i,`Select the ordering column for ${label}.`,Object.fromEntries(e.fields.map(f=>[f.name,f.name]))));bindings.push(choice('direction_'+i,`Select the requested ordering direction for ${label}.`,{ASC:'ASC',DESC:'DESC'}));}
  if(['get','transition'].includes(o.kind))bindings.push(choice('key_'+i,`Select the record identity source for ${label}.`,{path_id:ref('path.id'),zero:{lit:0},one:{lit:1}}));
  if(o.kind==='transition'){
   bindings.push(choice('state_field_'+i,`Which field holds the state changed by ${label}?`,Object.fromEntries(e.fields.filter(f=>f.type==='text').map(f=>[f.name,f.name]))));
   for(const side of ['from','to'])bindings.push(choice(side+'_'+i,`For ${label}, select the ${side==='from'?'permitted starting':'resulting'} state.`,Object.fromEntries(input.literals.strings.map((v:string,j:number)=>['s'+j,v]))));
  }
 }
 const bd=await ask('Operation',bindings,{entities,relationships,operations:operations.map(o=>({id:o.id,kind:o.kind,entity:o.entity})),routes:input.routes});
 for(let i=0;i<operations.length;i++){
  const o=operations[i];for(const f of entities.find(e=>e.name===o.entity)!.fields){const value=bd['value_'+i+'_'+f.name];if(value!==undefined&&value!==null)o.values[f.name]=value;}
  if(o.kind==='list')o.order=[{field:bd['order_'+i],direction:bd['direction_'+i]}];
  if(['get','transition'].includes(o.kind))o.key=bd['key_'+i];
  if(o.kind==='transition')o.transition={field:bd['state_field_'+i],from:bd['from_'+i],to:bd['to_'+i],on_repeat:'error',repeat_status:0};
 }
 const txs:Spec[]=[];
 for(let i=0;i<operations.length;i++){
  const o=operations[i],r=input.routes[i],e=entities.find(e=>e.name===o.entity)!;const label=r.method+' '+r.path;
  txs.push(yes('atomic_'+i,`Must ${label} execute its reads/guards/writes as one serialized atomic SQLite transaction?`));
  if(['create','guarded_create'].includes(o.kind))txs.push(choice('idempotency_'+i,`Does ${label} replay an original result for identical repeated requests, rather than rejecting a duplicate business identifier? Select the declared idempotency key, or none.`,{none:null,...Object.fromEntries(e.fields.filter(f=>!f.primary).map(f=>[f.name,f.name]))}));
  if(o.kind==='transition')txs.push(yes('repeat_'+i,`If ${label} has already reached its target state, must it return that same state without applying side effects again?`));
  if(['guarded_create','transition'].includes(o.kind)){
   const links=relationships.filter(l=>l.entity===o.entity);txs.push(choice('link_'+i,`Which relationship identifies the other record modified by ${label}?`,{none:null,...Object.fromEntries(links.map(l=>[l.field,l]))}));
   txs.push(choice('amount_'+i,`Which numeric field of ${o.entity} supplies the quantity for the other record's numeric change in ${label}?`,{none:null,...Object.fromEntries(e.fields.filter(f=>f.type==='integer'&&!f.primary).map(f=>[f.name,f.name]))}));
   // Counter candidates include all entity.numeric fields, not a task-specific resource name.
   txs.push(choice('counter_'+i,`Select the entity.field holding the numeric amount changed on the related record by ${label}; do not choose an identity.`,{none:null,...Object.fromEntries(entities.flatMap(t=>t.fields.filter(f=>f.type==='integer'&&!f.primary).map(f=>[t.name+'_'+f.name,{entity:t.name,field:f.name}])))}));
   txs.push(choice('delta_'+i,`Does ${label} add or subtract the quantity on that numeric record?`,{add:'add',sub:'sub',none:'unsupported'}));
   if(o.kind==='guarded_create'){txs.push(choice('guard_error_'+i,`Which error category applies when the precondition fails for ${label}?`,{invalid:'invalid',missing:'missing',conflict:'conflict',internal:'internal'}));txs.push(choice('guard_'+i,`Before the numeric change in ${label}, what must hold between the current numeric value and requested amount?`,{ge:'ge',le:'le',none:null}));}
  }
 }
 const td=await ask('Transaction',txs,{entities,relationships,operations:operations.map(o=>({id:o.id,kind:o.kind,entity:o.entity,values:o.values})),routes:input.routes});
 for(let i=0;i<operations.length;i++){
  const o=operations[i];o.atomic=td['atomic_'+i];const idem=td['idempotency_'+i];if(idem)o.idempotency={field:idem,input:ref('input.'+idem),replay_status:0};
  if(o.transition)o.transition.on_repeat=td['repeat_'+i]?'return':'error';
  if(['guarded_create','transition'].includes(o.kind)){
   const link=td['link_'+i],amount=td['amount_'+i],counter=td['counter_'+i],delta=td['delta_'+i];
   if(!link||!amount||!counter||counter.entity!==link.target||!['add','sub'].includes(delta)){graph.unresolved.push({operation:o.id,role:'Transaction',reason:'Missing/conflicting effect bindings'});continue;}
   const key=o.kind==='transition'?ref('row.'+link.field):o.values[link.field];if(!key){graph.unresolved.push({operation:o.id,reason:'Effect lookup key unavailable'});continue;}
   o.lookups=[{as:'resource',entity:link.target,key}];const current=ref('resource.'+counter.field),quantity=ref((o.kind==='transition'?'row.':'input.')+amount);
   o.effects=[{record:'resource',values:{[counter.field]:calc(delta,current,quantity)}}];if(o.kind==='guarded_create'&&td['guard_'+i])o.guards=[{expr:calc(td['guard_'+i],current,quantity),error:td['guard_error_'+i]}];
  }
 }
 const hs:Spec[]=[];for(const error of ['invalid','missing','conflict','internal'])hs.push(choice('error_'+error,`Choose the HTTP status for ${error} errors in this API.`,{s400:400,s404:404,s409:409,s422:422,s500:500}));
 for(let i=0;i<operations.length;i++){
  const o=operations[i],r=input.routes[i],e=entities.find(e=>e.name===o.entity)!;const label=r.method+' '+r.path;
  hs.push(choice('method_'+i,`Which HTTP method is explicitly required for the endpoint ${label}?`,{GET:'GET',POST:'POST',PATCH:'PATCH',DELETE:'DELETE'}));
  hs.push(choice('success_'+i,`Choose the successful initial HTTP status for ${label}.`,{s200:200,s201:201,s204:204}));
  hs.push(choice('response_'+i,`What response fields must ${label} return?`,{all:e.fields.map(f=>f.name),identity:e.fields.filter(f=>f.primary).map(f=>f.name),input:r.body}));
  hs.push(yes('exact_'+i,`Must the input for ${label} reject unknown object properties?`));
  for(const name of r.body)hs.push(choice('input_'+i+'_'+name,`For external request property '${name}' in ${label}, select the persisted field whose type/validation rules apply.`,Object.fromEntries(entities.flatMap(t=>t.fields.map(f=>[t.name+'_'+f.name,{entity:t.name,field:f.name}])))));
  if(o.idempotency||o.transition)hs.push(choice('replay_'+i,`Choose the HTTP status when ${label} repeats an already completed idempotent action.`,{s200:200,s201:201,s409:409}));
 }
 const hd=await ask('HTTP',hs,{entities,operations:operations.map(o=>({id:o.id,kind:o.kind,entity:o.entity})),routes:input.routes});
 const http=[];const errors:any={};for(const error of ['invalid','missing','conflict','internal'])errors[error]=hd['error_'+error];
 for(let i=0;i<operations.length;i++){
  const o=operations[i],r=input.routes[i];o.success_status=hd['success_'+i];o.response_fields=hd['response_'+i];o.input.exact=hd['exact_'+i];
  for(const name of r.body){const binding=hd['input_'+i+'_'+name];const rule=rules[binding.entity+'.'+binding.field];if(!rule){graph.unresolved.push({operation:o.id,reason:'Input rule unresolved'});continue;}o.input.fields.push({...rule,name});}
  if(o.idempotency)o.idempotency.replay_status=hd['replay_'+i];if(o.transition)o.transition.repeat_status=hd['replay_'+i];
  http.push({method:hd['method_'+i],path:r.path,operation:o.id});
 }
 const ir:IR={version:1,entities,relationships,operations,http,errors,provenance:graph.nodes.map(n=>({decision:n.id,role:n.role,source:n.requirement_source,dependencies:n.dependencies,call_id:n.call_id,model:n.model})),unresolved:graph.unresolved};return {ir,graph};
}
