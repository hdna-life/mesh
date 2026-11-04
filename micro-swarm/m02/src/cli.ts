import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';import {resolve,join,relative} from 'node:path';
import {Client} from '../../m01/src/provider.ts';import {hash} from './engine.ts';import {runArm} from './experiment.ts';import type {Arm} from './contracts.ts';
const root=resolve(import.meta.dirname,'..'),shared=resolve(root,'..'),workspace=resolve(root,'..','..'),reports=join(workspace,'reports/m0_2');
async function paths(dir:string):Promise<string[]>{const out:string[]=[];for(const name of await readdir(dir,{withFileTypes:true})){const p=join(dir,name.name);if(name.isDirectory()){if(!['runs','__pycache__'].includes(name.name))out.push(...await paths(p));}else out.push(p);}return out;}
async function fingerprints(){const files=[...await paths(join(root,'src')),...await paths(join(root,'tests')),...await paths(join(root,'benchmarks')),...await paths(join(root,'fixtures')),join(root,'config.json'),join(root,'contract.json'),join(root,'package.json'),join(root,'requirements.lock.txt'),join(reports,'protocol.md'),join(reports,'root-cause.md'),join(reports,'validation-results.json'),join(shared,'m01/src/provider.ts'),join(shared,'m01/src/extractor.ts'),join(shared,'m01/src/execution.ts'),join(shared,'m01/src/contracts.ts')].sort();const out:Record<string,string>={};for(const f of files)out[relative(root,f)]=hash(await readFile(f,'utf8'));return out;}
async function previousUnchanged(){const previous=JSON.parse(await readFile(join(reports,'previous-evidence-hashes.json'),'utf8'));for(const [file,digest] of Object.entries(previous))if(hash(await readFile(join(workspace,file),'utf8'))!==digest){ // Archives are binary; use raw hashing below.
 const {createHash}=await import('node:crypto');if(createHash('sha256').update(await readFile(join(workspace,file))).digest('hex')!==digest)throw new Error('Previous evidence changed: '+file);
}}
const cmd=process.argv[2]||'run';
try{
 await previousUnchanged();
 if(cmd==='freeze'){
  try{await readFile(join(root,'frozen.json'));throw new Error('Already frozen; a new protocol version is required');}catch(e:any){if(e.code!=='ENOENT')throw e;}
  const validation=JSON.parse(await readFile(join(reports,'validation-results.json'),'utf8'));if(!validation.unit_passed||!validation.regression_passed)throw new Error('Unit/regression checks must pass before freeze');
  await writeFile(join(root,'frozen.json'),JSON.stringify({milestone:'M0.2 — Contract-First Execution',frozen_at:new Date().toISOString(),files:await fingerprints()},null,2));console.log('M0.2 frozen.');
 }else if(cmd==='run'){
  const text=await readFile(join(root,'frozen.json'),'utf8'),frozen=JSON.parse(text);if(JSON.stringify(frozen.files)!==JSON.stringify(await fingerprints()))throw new Error('Frozen protocol changed');
  try{await readFile(join(reports,'comparison.json'));throw new Error('M0.2 already has a real comparison; no result selection reruns');}catch(e:any){if(e.code!=='ENOENT')throw e;}
  process.loadEnvFile(join(shared,'.env'));const config=JSON.parse(await readFile(join(root,'config.json'),'utf8'));
  process.env.MAX_DAILY_NEURONS=String(config.daily_neuron_reservation_cap);process.env.MAX_BATCH_CALLS=String(config.batch_request_limit);
  const client=new Client('cloudflare',shared,{}),results:any[]=[];
  for(const arm of config.arms as Arm[]){const result=await runArm(root,arm,client);results.push(result);console.log(JSON.stringify({arm,full_success:result.full_success,calls:result.calls,repairs:result.repairs,passed_tests:result.passed_test_count,first_failure:result.first_artifact_failure}));await writeFile(join(reports,'comparison.json'),JSON.stringify({milestone:config.milestone,protocol_hash:hash(text),config,results,complete:results.length===4},null,2));if(result.provider_stop)break;}
  await previousUnchanged();
 }else throw new Error('Commands: freeze, run');
}catch(e:any){console.error(e.category??'error',e.message);process.exitCode=1;}
