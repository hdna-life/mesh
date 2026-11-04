import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Client,Budget,type Message} from '../../m01/src/provider.ts';
import {extractSource} from '../../m01/src/extractor.ts';
import {ContractEngine,splitCapabilities,singleCapabilities,hash,type Task,type Check} from './engine.ts';
import {checkFile,execute,stage} from './validation.ts';
import {contract,type Arm,type Scenario} from './contracts.ts';
export async function runArm(root:string,arm:Arm,client:Client){
 const config=JSON.parse(await readFile(join(root,'config.json'),'utf8')),interfaces=JSON.parse(await readFile(join(root,'contract.json'),'utf8'));
 const scenario:Scenario=JSON.parse(await readFile(join(root,'benchmarks/tasks.json'),'utf8')).find((s:Scenario)=>s.id===config.scenario_id);
 const protocol_hash=hash(await readFile(join(root,'frozen.json'),'utf8'));
 const dir=join(root,'runs',`${Date.now()}-${arm}-${randomUUID().slice(0,8)}`);await mkdir(dir,{recursive:true});
 const split=['B','C'].includes(arm),engine=await ContractEngine.open(dir,split?splitCapabilities:singleCapabilities,arm==='A'?0:config.max_repairs_per_arm);
 const budget=new Budget(config.max_calls_per_arm,config.max_total_token_upper_per_arm,config.max_output_tokens_per_arm);
 const start=performance.now(),callsBefore=client.batchCalls;let lastRuntime:any=null;let firstRuntime:any=null;let lastChecks:Check[]=[];let firstFailure:any=null;let actualInput=0,actualOutput=0,usageComplete=true;let actualNeurons=0;let providerStop=false;
 const log=async(event:string,data:any)=>appendFile(join(dir,'trace.jsonl'),JSON.stringify({timestamp:new Date().toISOString(),milestone:config.milestone,arm,seed:config.seed,model_id:config.model_id,event,...data})+'\n');
 await writeFile(join(dir,'initial.json'),JSON.stringify({config,arm,scenario,interfaces,requirements:contract(scenario),protocol_hash,semantic_sources:config.semantic_sources},null,2));
 await log('semantic_sources',config.semantic_sources);
 const perform=async(t:Task)=>{
  if(performance.now()-start>config.run_timeout_ms)throw Object.assign(new Error('Run wall timeout'),{category:'timeout'});
  const feedback=lastChecks.filter(c=>!c.pass).slice(0,12);
  const dependencies=Object.fromEntries(t.requires.filter(d=>d!=='requirements').map(d=>{const dep=engine.tasks.get(d)!;return [dep.output,engine.artifacts[dep.output]];}));
  const role=t.id==='single'?'Implement the whole backend in app.py. Inline schema and validation belong to you. Do not output other files.':t.id==='schema'?'Produce ONLY SQLite schema.sql. Define the declared tables/constraints once. It must safely apply twice without changing or deleting data. Do not produce Python or app code.':t.id==='validation'?'Produce ONLY validation.py. Implement the declared pure validation functions and return conventions. Do not import Flask or SQLite, create routes, or write app.py.':'Produce ONLY app.py with every required HTTP method/route and full database transaction behavior. Use the supplied validation.py functions and read schema.sql at startup. Do not redefine validators, embed CREATE TABLE SQL, or write other artifacts.';
  const messages:Message[]=[{role:'system',content:`${role}\nThe engine owns paths and routing. Output one source file only; no JSON, explanations, or extra files. A single Markdown code block is allowed. ${t.attempt?'This is an authorized repair by the SAME artifact owner. Fix the supplied concrete failures in your prior source. Do not change another owner file.':''}`},{role:'user',content:JSON.stringify({requirements:contract(scenario),interface_contract:interfaces,target:t.output,dependencies,previous_source:t.candidate??engine.artifacts[t.output]??null,failures:feedback,semantic_source:config.semantic_sources})}];
  const input={requirements:contract(scenario),dependencies:Object.fromEntries(Object.entries(dependencies).map(([k,v])=>[k,hash(v)])),messages,generation:{seed:config.seed,temperature:0}};
  const {cached}=await engine.begin(t.id,t.owner,input);if(cached)return true;
  const maxOutput=arm==='A'?config.allocations.A[0]:arm==='A2'?config.allocations.A2[t.attempt-1]:t.attempt===1?config.allocations.B_C_initial[t.id]:config.allocations.B_C_repair;
  let parsed='';let checks:Check[]=[];
  try{
   const inputUpper=budget.reserve(messages,maxOutput);await log('inference_request',{task_id:t.id,owner:t.owner,attempt:t.attempt,messages,input_hash:t.input_hash,generation:{seed:config.seed,temperature:0,max_tokens:maxOutput},input_token_upper:inputUpper});
   const begin=performance.now();let reply;
   try{reply=await client.call(messages,maxOutput,config.seed,inputUpper,t.id);}catch(e:any){await log('inference_error',{task_id:t.id,status:e.status??null,category:e.category??'provider_error',message:e.message,latency_ms:performance.now()-begin});throw e;}
   await log('inference_response',{task_id:t.id,owner:t.owner,attempt:t.attempt,...reply});
   actualInput+=reply.input_tokens??0;actualOutput+=reply.output_tokens??0;if(reply.input_tokens===null||reply.output_tokens===null)usageComplete=false;actualNeurons+=(reply.provider_metadata as any)?.usage?.neurons??0;
   const source=extractSource(reply.raw,t.output.endsWith('.sql')?'sql':'python');parsed=source.source;await log('extraction',{task_id:t.id,format:source.format,source_hash:hash(parsed)});
   const candidate=join(dir,'candidates',`${t.id}-${t.attempt}`);await stage(candidate,{...engine.artifacts,[t.output]:parsed});
   const kind=t.id==='schema'?'schema':t.id==='validation'?'validation':split?'api_split':'api_single';
   const stat=checkFile(root,kind,join(candidate,t.output));checks=stat.checks;
   // Real checks run before artifact inclusion; AST alone is never application success.
   const syntaxOk=!checks.some(c=>!c.pass&&['python_syntax','checker_exception','checker_execution'].includes(c.name));
   if(t.id==='validation'&&syntaxOk){const behavior=await execute(root,candidate,scenario,'validation');await log('module_validation',{task_id:t.id,attempt:t.attempt,candidate,...behavior});checks.push(...behavior.tests.map((c:any)=>({...c,name:'module:'+c.name})));if(!behavior.evaluated)checks.push({name:'module_execution_available',pass:false,error:behavior.category});}
   if(['api','single'].includes(t.id)&&syntaxOk){
    const runtime=await execute(root,candidate,scenario);await log('acceptance_execution',{task_id:t.id,attempt:t.attempt,candidate,...runtime});lastRuntime=runtime;if(!firstRuntime)firstRuntime=runtime;
    checks.push(...runtime.tests.map((c:any)=>({...c,name:'http:'+c.name})));
    if(!runtime.evaluated||!runtime.passed)checks.push({name:'all_acceptance_tests',pass:false,error:runtime.category??'full acceptance failed'});
    try{await readFile(join(candidate,'verified.sqlite'));checks.push(...checkFile(root,'database',join(candidate,'verified.sqlite')).checks.map(c=>({...c,name:'database:'+c.name})));}catch(e:any){if(e.code!=='ENOENT')throw e;}
   }
   lastChecks=checks;firstFailure??=checks.find(c=>!c.pass)??null;await log('artifact_validation',{task_id:t.id,owner:t.owner,artifact:t.output,checks});
   return await engine.complete(t.id,t.owner,parsed,checks);
  }catch(e:any){
   lastChecks=[{name:e.category??'execution_error',pass:false,error:e.message}];firstFailure??=lastChecks[0];await log('artifact_failure',{task_id:t.id,artifact:t.output,category:e.category??'runtime_error',message:e.message});
   if(parsed)await engine.complete(t.id,t.owner,parsed,lastChecks);else await engine.fail(t.id,e);
   if(['provider_error','budget_exceeded','timeout'].includes(e.category))providerStop=true;
   return false;
  }
 };
 try{
  if(arm==='A'||arm==='A2'){
   const t=engine.tasks.get('single')!;
   while(true){const ok=await perform(t);if(ok||providerStop||engine.repairs>=engine.maxRepairs)break;await engine.retry(t.id,JSON.stringify(lastChecks.filter(c=>!c.pass)));}
  }else if(arm==='B'){
   // Fixed preregistered sequence, local repairs only. No rewind or discovered tasks.
   for(const id of config.fixed_order){const t=engine.tasks.get(id)!;let ok=false;while(true){ok=await perform(t);if(ok||providerStop||engine.repairs>=engine.maxRepairs)break;await engine.retry(id,JSON.stringify(lastChecks.filter(c=>!c.pass)));}if(!ok)break;}
  }else{
   while(true){
    const t=engine.dynamicNext();if(!t)break;
    if(['failed','invalidated'].includes(t.status)){
     if(engine.repairs>=engine.maxRepairs||providerStop)break;
     const responsible=engine.routeFailure(t.output);await engine.repairNode(responsible.id,JSON.stringify(lastChecks.filter(c=>!c.pass)));await engine.retry(responsible.id,JSON.stringify(lastChecks.filter(c=>!c.pass)));
    }
    await log('graph_snapshot',{tasks:[...engine.tasks.values()].map(({candidate,...t})=>t),edges:[...engine.tasks.values()].flatMap(t=>t.requires.map(r=>({from:r,to:t.id})))});
    const ok=await perform(t);if(providerStop)break;
   }
  }
 }catch(e:any){await log('engine_failure',{category:e.category??'runtime_error',message:e.message});firstFailure??={name:e.category??'runtime_error',error:e.message};}
 await engine.snapshot();
 const allCompleted=[...engine.tasks.values()].every(t=>t.status==='completed');
 const summary={milestone:config.milestone,run_id:dir.split('/').at(-1),arm,protocol_hash,full_success:allCompleted&&lastRuntime?.passed===true,all_contracts_completed:allCompleted,acceptance_evaluated:lastRuntime?.evaluated??false,passed_test_count:lastRuntime?.tests?.filter((t:any)=>t.pass).length??0,executed_test_count:lastRuntime?.tests?.length??0,first_failed_test:firstRuntime?.tests?.find((t:any)=>!t.pass)??null,final_failed_test:lastRuntime?.tests?.find((t:any)=>!t.pass)??null,first_artifact_failure:firstFailure,initial_http_tests:firstRuntime?.tests??[],final_http_tests:lastRuntime?.tests??[],calls:client.batchCalls-callsBefore,tokens:usageComplete?{input:actualInput,output:actualOutput}:null,actual_neurons:actualNeurons,elapsed_ms:Math.round(performance.now()-start),repairs:engine.repairs,artifact_validation_errors:engine.ledger.filter(e=>e.event==='rejected'||e.event==='failed'),graph_changes:engine.graphChanges,task_states:[...engine.tasks.values()].map(({candidate,...t})=>t),provider_stop:providerStop,budget:{input_upper:budget.inputUpper,output_reserved:budget.outputReserved},notes:'HTTP setup preconditions can block later tests. Only full unchanged acceptance pass is success; not-run tests are not counted as passed.'};
 await writeFile(join(dir,'summary.json'),JSON.stringify(summary,null,2));await log('run_complete',summary);return summary;
}
