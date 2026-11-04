import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Client,Budget,type Message} from './provider.ts';
import {MODEL,contract,protocol,roles,type Scenario,type Arm} from './contracts.ts';
import {validateSyntax,extractSource,extractAndValidate} from './extractor.ts';
import {writeArtifacts} from './artifacts.ts';
import {runScenario,report} from './experiment.ts';
const root=resolve(import.meta.dirname,'..'),shared=resolve(root,'..');
try{process.loadEnvFile(join(shared,'.env'));}catch(e:any){if(e.code!=='ENOENT')throw e;}
process.env.PYTHON=resolve(shared,'.venv/bin/python');process.env.MAX_DAILY_NEURONS='2500';process.env.MAX_BATCH_CALLS='36';
const frozenText=await readFile(join(root,'benchmarks/frozen.json'),'utf8'),frozen=JSON.parse(frozenText);
for(const [file,hash] of Object.entries(frozen.files))if(createHash('sha256').update(await readFile(join(root,file))).digest('hex')!==hash)throw new Error('Frozen M0.1 protocol changed');
const calls=JSON.parse(await readFile(join(root,'benchmarks/protocol-calls.json'),'utf8'));if(calls.length!==20)throw new Error('Expected 20 calls');
const scenarios:Scenario[]=JSON.parse(await readFile(join(root,'benchmarks/tasks.json'),'utf8'));
const runId=`M01-protocol-${Date.now()}-${randomUUID().slice(0,8)}`,dir=join(root,'runs',runId);await mkdir(dir,{recursive:true});
const protocol_sha256=createHash('sha256').update(frozenText).digest('hex');
await writeFile(join(dir,'initial.json'),JSON.stringify({milestone:'M0.1 — Protocol Independence',protocol_sha256,calls,gate:'at least 18/20',max_daily_neurons:2500,shared_ledger:'../.budget.json'},null,2));
const client=new Client('cloudflare',shared,{}),results:any[]=[],main:any[]=[];
const log=async(event:string,value:any)=>appendFile(join(dir,'trace.jsonl'),JSON.stringify({timestamp:new Date().toISOString(),event,model_id:MODEL,...value})+'\n');
for(const call of calls){
 const scenario=scenarios.find(s=>s.id===call.scenario_id)!;
 const messages:Message[]=[{role:'system',content:`${roles.single}\n${protocol}\nProduce ONLY app.py Python source. Its filename and destination are chosen by the system.`},{role:'user',content:contract(scenario)}];
 const budget=new Budget(1,48000,2048),inputUpper=budget.reserve(messages,call.max_output_tokens);
 const result:any={id:call.id,seed:call.seed,target:call.target,usable:false,raw_syntax_valid:false,extracted:false,syntax_valid:false,written:false,provider_error:null};const begin=performance.now();
 await log('inference_request',{call_id:call.id,seed:call.seed,messages,generation:{temperature:0,seed:call.seed,max_tokens:call.max_output_tokens},input_upper:inputUpper});
 try{
  const reply=await client.call(messages,call.max_output_tokens,call.seed,inputUpper,'single');await log('inference_response',{call_id:call.id,...reply});
  result.input_tokens=reply.input_tokens;result.output_tokens=reply.output_tokens;result.actual_neurons=(reply.provider_metadata as any)?.usage?.neurons??null;
  result.raw_syntax_valid=validateSyntax(root,reply.raw,'python').valid;
  try{const chosen=extractSource(reply.raw,'python');result.extracted=true;result.format=chosen.format;const output=await extractAndValidate(root,reply.raw,'python');result.syntax_valid=true;result.format=output.format;result.source_sha256=output.sha256;await writeArtifacts(join(dir,call.id),{'app.py':output.source});result.written=true;result.usable=true;}
  catch(e:any){result.failure_category=e.category||'write_error';result.error=e.message;}
 }catch(e:any){result.failure_category=e.category||'provider_error';result.provider_error=e.message;}
 result.elapsed_ms=Math.round(performance.now()-begin);results.push(result);await log('protocol_result',result);await writeFile(join(dir,'protocol-results.json'),JSON.stringify(results,null,2));
 console.log(JSON.stringify({call:call.id,usable:result.usable,format:result.format??null,raw_syntax_valid:result.raw_syntax_valid,failure:result.failure_category??null}));
 if(result.provider_error){console.error('Provider/budget error: stopping. Denominator remains 20.');break;}
}
const usable=results.filter(r=>r.usable).length,rawValid=results.filter(r=>r.raw_syntax_valid).length,complete=results.length===20&&!results.some(r=>r.provider_error),gate=complete&&usable>=18;
await log('gate',{complete,usable,denominator:20,threshold:18,passed:gate});
if(gate){
 console.log('Protocol gate PASS; running inventory A/A2/B/C. Runtime correctness still unproven.');
 for(const arm of ['A','A2','B','C'] as Arm[]){const r=await runScenario(root,scenarios.find(s=>s.id==='dev-inventory')!,arm,client,42);main.push(r);console.log(JSON.stringify({arm:r.arm,passed:r.passed,evaluated:r.evaluated,calls:r.calls,failures:r.failure_categories}));if(r.provider_failures||r.failure_categories.includes('budget_exceeded'))break;}
}
const summary={milestone:'M0.1 — Protocol Independence',run_id:runId,protocol_sha256,complete,planned_calls:20,completed_calls:results.length,raw_syntax_valid:rawValid,usable_outputs:usable,success_rate:usable/20,gate_passed:gate,results,main_runs:main.map(r=>r.run_id),actual_protocol_neurons:results.reduce((a,r)=>a+(r.actual_neurons??0),0)};
await writeFile(join(dir,'summary.json'),JSON.stringify(summary,null,2));await mkdir(join(root,'results'),{recursive:true});await writeFile(join(root,'results/M01-evidence.json'),JSON.stringify({summary,main},null,2));
const rows=results.map(r=>`| ${r.id} | ${r.seed} | ${r.raw_syntax_valid?'yes':'no'} | ${r.format??'—'} | ${r.usable?'yes':'no'} | ${r.failure_category??'—'} |`);
const lines=['# M0.1 — Protocol Independence','',`20 bağımsız çağrı kapısı: **${usable}/20 (${usable*5}%) — ${gate?'PASS':complete?'FAIL':'INCOMPLETE'}**. Ön kayıt eşiği 18/20.`,`Ham yanıt Python sözdizimi geçişi: ${rawValid}/20. Otomatik kullanılabilir kaynak: ${usable}/20.`,'','Bu, çalışan uygulama oranı değildir. AST parse importları çalıştırmaz, bağımlılık veya iş kuralı doğrulamaz. 20 stateless request aynı inventory app.py görevini farklı seed ile üretir; 20 farklı görev değildir.','','| Çağrı | Seed | Ham sözdizimi | Format | Otomatik kullanılabilir | Hata |','|---|---:|---|---|---|---|',...rows,'',`Protocol API Neuron toplamı: ${summary.actual_protocol_neurons.toFixed(2)}. M0 ile ortak günlük ledger korunur.`, '',gate?'Kapı geçti; aşağıdaki ayrı ana görev koşumlarına dönüldü.':'Kapı geçilmedi; ana A/A2/B/C koşumu yapılmadı.','','| Kol | Çağrı | Uygulama başarı | Çalıştırıldı | Hatalar |','|---|---:|---|---|---|',...main.map(r=>`| ${r.arm} | ${r.calls} | ${r.passed?'PASS':'FAIL'} | ${r.evaluated?'yes':'no'} | ${r.failure_categories.join(', ')||'—'} |`),'',main.some(r=>r.passed)?'En az bir uygulama testleri geçti. Tek görev geniş koordinasyon tezini kanıtlamaz.':'**Çalışan uygulama / koordinasyon kazancı gösterilmedi.**','',`Ham trace: runs/${runId}/trace.jsonl. Çıkarılan dosyalar ${runId}/protocol-XX/app.py içinde. Ana koşumlar ayrı runs klasörlerinde. Orijinal M0 ../RESULTS.md içinde korunur.`,'','Extractor/prompt/test sonuçlara göre değiştirilmedi. Başarısızlıklar paydadan çıkarılmadı.'];
await writeFile(join(root,'RESULTS.md'),lines.join('\n')+'\n');if(main.length)await report(root,main,'APPLICATION_RESULTS.md');console.log(JSON.stringify({protocol_gate:gate,usable,denominator:20,main_successes:main.filter(r=>r.passed).length,run_id:runId}));
