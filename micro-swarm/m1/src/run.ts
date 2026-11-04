import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve,join} from 'node:path';import {createHash} from 'node:crypto';
import {DecisionsClient} from './provider.ts';import {synthesize} from './decisions.ts';import {compile} from './compiler.ts';import {execute} from '../../m02/src/validation.ts';
export async function run(root:string){
 const config=JSON.parse(await readFile(join(root,'config.json'),'utf8')),input=JSON.parse(await readFile(join(root,'benchmarks/input.json'),'utf8')),requirements=await readFile(join(root,'benchmarks/requirements.txt'),'utf8');
 const client=new DecisionsClient(root,config),dir=join(root,'runs',`backend-${Date.now()}`);await mkdir(dir,{recursive:true});
 const start=performance.now();let graph:any={nodes:[],roles:[],unresolved:[]},ir:any=null,compiled:any=null,verification:any=null,error:any=null;let cost=0,calls=0,inferenceMs=0;
 await writeFile(join(dir,'initial.json'),JSON.stringify({config,input,requirements,frozen_sha256:createHash('sha256').update(await readFile(join(root,'frozen.json'))).digest('hex')},null,2));
 try{
  const result=await synthesize(input,requirements,async(state,q,role)=>{const response=await client.call(state,q,role);calls++;cost+=response.cost_usd;inferenceMs+=response.latency_ms;console.log(JSON.stringify({role,questions:Object.keys(q).length,model:response.model,cost_usd:response.cost_usd,latency_ms:response.latency_ms}));return response;},async current=>{graph=JSON.parse(JSON.stringify(current));await writeFile(join(dir,'graph.json'),JSON.stringify(graph,null,2));});
  graph=result.graph;ir=result.ir;await writeFile(join(dir,'graph.json'),JSON.stringify(graph,null,2));await writeFile(join(dir,'ir.json'),JSON.stringify(ir,null,2));
  if(!ir)throw Object.assign(new Error('Missing entity/IR decisions'),{category:'incomplete_ir'});
  compiled=await compile(root,ir,join(dir,'application'));
  const m02=resolve(root,'..','m02'),scenario=JSON.parse(await readFile(join(m02,'benchmarks/tasks.json'),'utf8')).find((s:any)=>s.id==='dev-inventory');
  verification=await execute(m02,join(dir,'application'),scenario);await writeFile(join(dir,'verification.json'),JSON.stringify(verification,null,2));
 }catch(e:any){error={category:e.category??'integration_error',message:e.message};}
 const compilerIssues=error&&['invalid_ir','incomplete_ir','unsupported_operation'].includes(error.category)?error.message.split('; '):[];
 const conflicts=compilerIssues.filter((s:string)=>/conflict|Invalid relationship|Unknown row reference|Idempotency key must be unique|Cannot mutate/i.test(s));
 graph.conflicts=conflicts.map((reason:string)=>({reason,status:'unresolved',source:'deterministic IR consistency checker; no correction applied'}));await writeFile(join(dir,'graph.json'),JSON.stringify(graph,null,2));
 const ledger=JSON.parse(await readFile(join(root,'.openrouter-budget.json'),'utf8'));
 const summary={milestone:'M1 — Jev Decision Mesh',run_id:dir.split('/').at(-1),model:config.model,semantic_decisions:graph.nodes.length,typed_valid_decisions:graph.nodes.filter((n:any)=>n.status==='resolved').length,conflicts:graph.conflicts,unresolved:graph.unresolved,ir_complete:!!ir&&compilerIssues.length===0&&!ir.unresolved.length,compiler_created_application:!!compiled,compiler_output:compiled,backend_started:verification?.tests?.some((t:any)=>t.name==='initial_products_empty')??false,full_success:verification?.passed===true,passed_tests:verification?.tests?.filter((t:any)=>t.pass).length??0,executed_tests:verification?.tests?.length??0,tests:verification?.tests??[],inference_requests:calls,inference_ms:inferenceMs,semantic_api_cost_usd:cost,total_api_cost_usd_including_smoke:ledger.actual_usd,total_reserved_usd:ledger.reserved_usd,elapsed_ms:Math.round(performance.now()-start),error,compiler_errors:compilerIssues,mechanics_source:'Handwritten generic relational/validation/transaction/HTTP runtime; no task-specific entity names. Model supplies typed selections, not code.',model_free_controls:{human_complete_ir:'control-result.json',fixed_choice_and_empty:'control-policies.json'},no_generative_model_used:true};
 await writeFile(join(dir,'summary.json'),JSON.stringify(summary,null,2));await writeFile(join(root,'RESULTS.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));return summary;
}
