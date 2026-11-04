import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Client,Budget} from './provider.ts';
import {runScenario,report} from './experiment.ts';
import {MODEL,Failure,type Scenario,type Arm} from './contracts.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
try{process.loadEnvFile(join(root,'.env'));}catch(e:any){if(e.code!=='ENOENT')throw e;}
const argv=process.argv.slice(2),command=argv[0]||'smoke';
const option=(key:string,fallback:string)=>{const i=argv.indexOf('--'+key);return i<0?fallback:argv[i+1];};
const provider=option('provider','mock');
const arms=option('arms','A,B,C').split(',') as Arm[];
const seed=Number(option('seed','42'));
if(arms.some(a=>!['A','A2','B','C'].includes(a))||!Number.isSafeInteger(seed)||seed<1||seed>9999999999)throw new Error('Invalid arms or seed');
const scenarios:Scenario[]=JSON.parse(await readFile(join(root,'benchmarks/tasks.json'),'utf8'));
async function fingerprint(){
 const paths=['benchmarks/tasks.json','benchmarks/runner.py','fixtures/gold.py',...((await readdir(join(root,'src'))).filter(f=>f.endsWith('.ts')).map(f=>'src/'+f))].sort();
 const entries:Record<string,string>={};for(const file of paths)entries[file]=createHash('sha256').update(await readFile(join(root,file))).digest('hex');return entries;
}
async function verifyFreeze(){
 let frozen:any;try{frozen=JSON.parse(await readFile(join(root,'benchmarks/frozen.json'),'utf8'));}catch{throw new Error('Benchmark not frozen. Run npm run freeze before experiments.');}
 if(JSON.stringify(frozen.files)!==JSON.stringify(await fingerprint()))throw new Error('Frozen protocol changed; preserve old traces and create a new experiment revision.');
}
const gold=await readFile(join(root,'fixtures/gold.py'),'utf8');
const client=new Client(provider,root,{'app.py':gold});
try {
 if(command==='freeze') {
  try{await readFile(join(root,'benchmarks/frozen.json'));throw new Error('Already frozen; use a new experiment revision rather than overwriting.');}catch(e:any){if(e.code!=='ENOENT')throw e;}
  await writeFile(join(root,'benchmarks/frozen.json'),JSON.stringify({milestone:'M0 — Can Small Models Cooperate?',frozen_at:new Date().toISOString(),files:await fingerprint()},null,2));console.log('M0 protocol frozen.');
 } else if(command==='provider-smoke') {
  await verifyFreeze();
  if(provider!=='cloudflare')throw new Error('Provider smoke requires cloudflare');
  const messages=[{role:'user',content:'Reply with exactly OK.'}];const budget=new Budget();const upper=budget.reserve(messages,8);
  // Store even failed provider smoke attempts without logging secrets.
  const dir=join(root,'runs',`provider-${Date.now()}`);await mkdir(dir,{recursive:true});
  try {const r=await client.call(messages,8,seed,upper,'single');await writeFile(join(dir,'provider.json'),JSON.stringify({model_id:MODEL,messages,...r},null,2));console.log(JSON.stringify({status:r.status,provider:r.provider,model:MODEL,raw:r.raw,latency_ms:r.latency_ms}));}
  catch(e:any){await writeFile(join(dir,'provider.json'),JSON.stringify({model_id:MODEL,messages,error:e.message,category:e.category},null,2));throw e;}
 } else if(command==='replay') {
  await verifyFreeze();
  const source=resolve(root,option('from',''));const initial=JSON.parse(await readFile(join(source,'initial.json'),'utf8'));
  const events=(await readFile(join(source,'trace.jsonl'),'utf8')).trim().split('\n').map(s=>JSON.parse(s));
  const replayClient=new Client('replay',root,{},events.filter(e=>e.event==='inference_response'));
  const summary=await runScenario(root,initial.scenario,initial.arm,replayClient,initial.seed);await report(root,[summary],'REPLAY.md');console.log(JSON.stringify(summary));
 } else if(['smoke','benchmark','run'].includes(command)) {
  await verifyFreeze();
  let selected=command==='benchmark'?scenarios.filter(s=>s.split==='holdout'):scenarios.filter(s=>s.id===option('scenario','dev-inventory'));
  if(!selected.length)throw new Error('Unknown scenario');
  const max=Number(option('limit',String(selected.length)));if(!Number.isInteger(max)||max<1)throw new Error('Invalid limit');selected=selected.slice(0,max);
  const results:any[]=[];
  async function cumulative(){
   const all:any[]=[];for(const name of await readdir(join(root,'runs'))){try{const value=JSON.parse(await readFile(join(root,'runs',name,'summary.json'),'utf8'));if(value.provider===provider)all.push(value);}catch(e:any){if(!['ENOENT','ENOTDIR'].includes(e.code))throw e;}}return all;
  }
  // Same seed, contract, acceptance runner and budget ceiling. Rotate arm order by scenario.
  runsLoop: for(let i=0;i<selected.length;i++)for(let j=0;j<arms.length;j++){
   const arm=arms[(j+i)%arms.length];const r=await runScenario(root,selected[i],arm,client,seed);results.push(r);
   console.log(JSON.stringify({run_id:r.run_id,arm,provider:r.provider,passed:r.passed,evaluated:r.evaluated,calls:r.calls,failures:r.failure_categories,elapsed_ms:r.elapsed_ms}));
   await report(root,await cumulative(),provider==='cloudflare'?'RESULTS.md':provider==='mock'?'MOCK_RESULTS.md':'REPLAY.md');
   // Provider failures or batch budget exhaustion stop further chargeable requests, never switch provider/model.
   if(provider==='cloudflare'&&(r.provider_failures||r.failure_categories.includes('budget_exceeded'))){process.exitCode=1;break runsLoop;}
  }
  if(provider==='mock'&&results.some(r=>!r.passed))process.exitCode=1;
 } else throw new Error('Commands: smoke, run, benchmark, provider-smoke, replay, freeze');
} catch(e:any){console.error(`${e.category||'error'}: ${e.message}`);process.exitCode=1;}
