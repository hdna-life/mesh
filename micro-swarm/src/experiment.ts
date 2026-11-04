import {mkdir,writeFile,appendFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {contract,protocol,roles,MODEL,Failure,parseResponse,type Scenario,type Arm,type Files} from './contracts.ts';
import {registry,plan} from './graph.ts';
import {Client,Budget,type Message} from './provider.ts';
import {writeArtifacts} from './artifacts.ts';
import {execute} from './execution.ts';
export async function runScenario(root:string,scenario:Scenario,arm:Arm,client:Client,seed=42) {
 const callsBefore=client.batchCalls;
 const frozen=await readFile(join(root,'benchmarks/frozen.json'),'utf8');
 const protocol_sha256=createHash('sha256').update(frozen).digest('hex');
 const start=performance.now(),run_id=`${Date.now()}-${scenario.id}-${arm}-${randomUUID().slice(0,8)}`;
 const dir=join(root,'runs',run_id);await mkdir(join(dir,'artifacts'),{recursive:true});
 const budget=new Budget();let files:Files={},available=new Set(['spec.api_contract']),history:any[]=[],failures:string[]=[],test:any=null,taskCount=0,repairCount=0;
 const state=()=>({available:[...available],files:Object.keys(files),history,repairCount});
 const log=async(event:string,data:any)=>appendFile(join(dir,'trace.jsonl'),JSON.stringify({timestamp:new Date().toISOString(),run_id,scenario_id:scenario.id,arm,seed,model_id:MODEL,event,...data})+'\n');
 const spec=contract(scenario);
 await writeFile(join(dir,'initial.json'),JSON.stringify({milestone:'M0 — Can Small Models Cooperate?',protocol_sha256,scenario,arm,seed,model_id:MODEL,spec,budget:{max_calls:budget.maxCalls,max_tokens_upper:budget.maxTokens,max_output_tokens:budget.maxOutput},protocol},null,2));
 const recordError=async(e:any,context:string)=>{const category=e.category||'runtime_error';failures.push(category);await log('failure',{category,context,message:e.message,http_status:e.status??null,latency_ms:e.latency_ms??null,retry_count:repairCount});};
 const invoke=async(role:string,capability_id:string,feedback:any=null)=>{
  if(++taskCount>8)throw new Failure('budget_exceeded','max tasks');
  if(performance.now()-start>120000)throw new Failure('timeout','Run deadline 120s exceeded');
  const context=role==='schema'?{}:files;
  const messages:Message[]=[{role:'system',content:`${roles[role]}\n${protocol}\nAllowlisted proposed_tasks: ${registry.map(c=>c.id).join(', ')}`},{role:'user',content:JSON.stringify({spec,files:context,feedback,state:{available:[...available]}})}];
  const outputLimit=role==='single'&&arm==='A'?8192:Math.min(({schema:1024,api:3072,validation:2048,repair:1024,single:2048} as Record<string,number>)[role],budget.maxOutput-budget.outputReserved);
  const inputUpper=budget.reserve(messages,outputLimit);
  await log('inference_request',{expert_id:role,capability_id,messages,generation:{temperature:0,seed,max_tokens:outputLimit},input_token_upper:inputUpper,retry_count:repairCount});
  const begin=performance.now();let reply;
  try{reply=await client.call(messages,outputLimit,seed,inputUpper,role);}catch(e:any){await log('inference_error',{expert_id:role,capability_id,latency_ms:performance.now()-begin,http_status:e.status??null,category:e.category||'provider_error',retry_count:repairCount});throw e;}
  await log('inference_response',{expert_id:role,capability_id,...reply,retry_count:repairCount});
  if(reply.input_tokens===null||reply.output_tokens===null)budget.usageComplete=false;
  budget.actualInput+=reply.input_tokens??0;budget.actualOutput+=reply.output_tokens??0;
  const parsed=parseResponse(reply.raw);
  for(const req of parsed.requirements)if(!available.has(req))throw new Failure('missing_capability',req);
  // Validate proposals BEFORE applying artifacts. Model cannot choose arbitrary executable work.
  for(const proposed of parsed.proposed_tasks)if(!registry.some(c=>c.id===proposed))throw new Failure('missing_capability',`Rejected proposed capability ${proposed}`);
  const updated={...files};for(const f of parsed.result.files)updated[f.path]=f.content;
  if(role==='schema'&&!updated['schema.sql'])throw new Failure('integration_mismatch','Schema role did not produce schema.sql');
  if(['api','single','validation'].includes(role)&&!updated['app.py'])throw new Failure('integration_mismatch','Missing app.py');
  if(role==='schema'&&parsed.result.files.some(f=>f.path!=='schema.sql'))throw new Failure('integration_mismatch','Schema role may only write schema.sql');
  if(role==='repair'&&parsed.result.files.some(f=>!Object.hasOwn(files,f.path)))throw new Failure('integration_mismatch','Repair may only change existing files');
  files=updated;await writeArtifacts(join(dir,'artifacts'),files);
  await writeArtifacts(join(dir,`attempt-${taskCount}`),files);
  history.push({capability_id,role,requirements:parsed.requirements,proposed_tasks:parsed.proposed_tasks,assumptions:parsed.assumptions});
  return parsed;
 };
 const evaluate=async()=>{test=await execute(root,join(dir,'artifacts'),scenario,client.kind);await log('execution',test);if(test.category)failures.push(test.category);return test;};
 try {
  if(arm==='A'||arm==='A2') {
   let feedback:any=null;
   for(let n=0;n<(arm==='A'?1:4);n++){
    try{await invoke('single','baseline.complete',feedback);}catch(e:any){await recordError(e,'baseline');feedback={category:e.category,message:e.message};if(arm==='A'||e.category==='provider_error'||e.category==='budget_exceeded')throw e;continue;}
    await evaluate();if(test.passed||!test.evaluated)break;feedback=test;repairCount++;
   }
  } else if(arm==='B') {
   for(const cap of registry){
    if(cap.role==='repair'){available.add('execution.failure');repairCount++;}
    try{await invoke(cap.role,cap.id,cap.role==='repair'?test:null);cap.produces.forEach(x=>available.add(x));}
    catch(e:any){await recordError(e,cap.id);if(['provider_error','budget_exceeded'].includes(e.category))throw e;}
    if(cap.role==='validation')await evaluate();
   }
   await evaluate();
  } else {
   // Backward chaining from unfulfilled artifact goals. No inference in planner/scheduler.
   let iterations=0;
   while(!available.has('application.validated')){
    if(++iterations>8)throw new Failure('budget_exceeded','Graph expansion limit');
    const queue=plan(['application.validated'],available);
    await log('graph',{nodes:queue,edges:queue.flatMap(c=>c.requires.map(r=>({from:r,to:c.id}))),state:state()});
    const cap=queue[0];if(!cap)throw new Failure('missing_capability','No runnable capability');
    if(cap.requires.some(r=>!available.has(r)))throw new Failure('missing_capability','Blocked precondition');
    let parsed;try{parsed=await invoke(cap.role,cap.id);}catch(e:any){await recordError(e,cap.id);if(repairCount>=2||!['parse_error','schema_violation','integration_mismatch'].includes(e.category))throw e;repairCount++;await log('retry',{capability_id:cap.id,retry_count:repairCount});continue;}
    cap.produces.forEach(x=>available.add(x));
    for(const proposal of parsed.proposed_tasks){
     const proposed=registry.find(c=>c.id===proposal)!;
     if(proposed.produces.every(a=>available.has(a))){await log('task_deduplicated',{proposal});continue;}
     // Proposal expands only allowed goal dependencies; execution.failure must originate in tests.
     if(proposed.role==='repair'){await log('task_blocked',{proposal,missing:['execution.failure']});continue;}
     const expansion=plan(proposed.produces,available);await log('graph_expansion',{proposal,nodes:expansion});
     // Known initial goals already include schema/api/validation. No unseen capability is hidden here.
    }
   }
   await evaluate();
   while(test.evaluated&&!test.passed&&repairCount<2){
    available.add('execution.failure');available.delete('application.repaired');
    const queue=plan(['application.repaired'],available);await log('graph',{nodes:queue,state:state()});
    repairCount++;await invoke('repair','code.repair',test);available.add('application.repaired');await evaluate();
   }
  }
 } catch(e:any) {if(!failures.includes(e.category))await recordError(e,'run');}
 await writeFile(join(dir,'state.json'),JSON.stringify(state(),null,2));
 await writeFile(join(dir,'graph.json'),JSON.stringify({registry,state:state()},null,2));
 const summary={milestone:'M0 — Can Small Models Cooperate?',protocol_sha256,run_id,scenario_id:scenario.id,split:scenario.split,arm,seed,provider:client.kind,model_id:MODEL,model_version:'provider not guaranteed pinned',research_eligible:client.kind==='cloudflare',passed:test?.evaluated===true&&test.passed===true,evaluated:test?.evaluated===true,elapsed_ms:Math.round(performance.now()-start),calls:client.kind==='cloudflare'?client.batchCalls-callsBefore:budget.calls,inference_attempts:budget.calls,neuron_reservation_upper:budget.inputUpper*2457/1e6+budget.outputReserved*18252/1e6,tokens:budget.usageComplete&&budget.calls?{input:budget.actualInput,output:budget.actualOutput}:null,reserved_input_upper:budget.inputUpper,reserved_output:budget.outputReserved,provider_failures:failures.filter(x=>x==='provider_error').length,failure_categories:[...new Set(failures)],test:test??{passed:false,evaluated:false,tests:[]},artifact_sha256:createHash('sha256').update(JSON.stringify(files)).digest('hex')};
 await writeFile(join(dir,'summary.json'),JSON.stringify(summary,null,2));await log('run_complete',summary);return summary;
}
export async function report(root:string,runs:any[],file:string) {
 const lines=['# MICRO-SWARM sonuçları','',`Tarih: ${new Date().toISOString()}`,'','Mock/replay satırları model başarısı değildir. Değerlendirilmeyen koşumlar başarısızlık oranına çevrilmez.','', '| Provider | Kol | Geçen / toplam | Değerlendirilen | Çağrı | Token (gerçek) | Süre ms | p95 ms | Neuron üst sınır | Provider hatası | Hata türleri |','|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|'];
 for(const provider of [...new Set(runs.map(r=>r.provider))])for(const arm of ['A','A2','B','C']){
  const rs=runs.filter(r=>r.provider===provider&&r.arm===arm);if(!rs.length)continue;
  const sum=(f:(r:any)=>number)=>rs.reduce((a,r)=>a+f(r),0);
  lines.push(`| ${provider} | ${arm} | ${sum(r=>+r.passed)} / ${rs.length} | ${sum(r=>+r.evaluated)} | ${sum(r=>r.calls)} | ${rs.every(r=>r.tokens)?sum(r=>r.tokens.input+r.tokens.output):'bilinmiyor'} | ${sum(r=>r.elapsed_ms)} | ${rs.map(r=>r.elapsed_ms).sort((a,b)=>a-b)[Math.ceil(rs.length*.95)-1]} | ${sum(r=>r.neuron_reservation_upper??0).toFixed(2)} | ${sum(r=>r.provider_failures)} | ${[...new Set(rs.flatMap(r=>r.failure_categories))].join(', ')||'—'} |`);
 }
 const real=runs.filter(r=>r.research_eligible&&r.split==='holdout'),a=real.filter(r=>r.arm==='A'),b=real.filter(r=>r.arm==='B'),c=real.filter(r=>r.arm==='C');
 const complete=(rs:any[])=>rs.length===20&&new Set(rs.map(r=>r.scenario_id)).size===20&&rs.every(r=>r.evaluated);
 const ready=complete(a)&&complete(b)&&complete(c);
 lines.push('','## Karar','',ready?`K1: ${c.filter(r=>r.passed).length>=4?'sağlandı':'sağlanmadı'}. K2: ${a.filter(r=>r.passed).length===0?'oran tanımsız; koordinasyon kazancı kanıtlanmadı':c.filter(r=>r.passed).length>=2*a.filter(r=>r.passed).length?'sayısal eşik sağlandı; küçük örneklem sinyali':'sağlanmadı'}.`:'**TEZ KANITLANMADI.** Tam, gerçek ve kabul testleri çalıştırılmış 20 × A/B/C veri kümesi yok. Araştırma kararı verilemez.','', 'C ile B karşılaştırması ve eşit bütçeli A2 kontrolü olmadan dinamik koordinasyon katkısı iddia edilmez. 20 görevde eşiklerin aşılması kesin kanıt değildir.','', '## Koşumlar','',...runs.map(r=>`- ${r.run_id}: ${r.passed?'PASS':r.evaluated?'FAIL':'NOT EVALUATED'} (${r.provider})`));
 await writeFile(join(root,file),lines.join('\n')+'\n');
}
