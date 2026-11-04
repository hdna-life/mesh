import {readFile,writeFile,readdir} from 'node:fs/promises';import {resolve,join,relative} from 'node:path';import {createHash} from 'node:crypto';import {DecisionsClient} from './provider.ts';import {run} from './run.ts';
const root=resolve(import.meta.dirname,'..'),workspace=resolve(root,'..','..');const hash=(x:Uint8Array)=>createHash('sha256').update(x).digest('hex');
async function list(dir:string):Promise<string[]>{const files:string[]=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())files.push(...await list(path));else files.push(path);}return files;}
async function previous(){const old=JSON.parse(await readFile(join(root,'previous-hashes.json'),'utf8'));for(const [p,digest]of Object.entries(old))if(hash(await readFile(join(workspace,p)))!==digest)throw new Error('Previous experiment changed: '+p);}
async function fingerprint(){const files=[...await list(join(root,'src')),...await list(join(root,'tests')),...await list(join(root,'benchmarks')),join(root,'config.json'),join(root,'PROTOCOL.md'),join(root,'package.json'),join(root,'previous-hashes.json'),join(root,'validation-results.json')];const old=JSON.parse(await readFile(resolve(root,'../m02/frozen.json'),'utf8'));for(const path of Object.keys(old.files))files.push(resolve(root,'../m02',path));const out:Record<string,string>={};for(const path of [...new Set(files)].sort())out[relative(root,path)]=hash(await readFile(path));return out;}
try{
 await previous();const cmd=process.argv[2];const config=JSON.parse(await readFile(join(root,'config.json'),'utf8'));
 if(cmd==='smoke'){
  process.loadEnvFile(resolve(root,'..','.env'));const payload={state:{requirement:'Persist application records in a local SQLite database.'},questions:{storage:{type:'choice' as const,instructions:'Which storage is explicitly requested?',criteria:{sqlite:'A local SQLite database.',remote:'An external remote API.'}},persistent:{type:'noul' as const,instructions:'Must records persist?',criteria:{true:'The requirement asks for persistent records.',false:'The requirement asks for ephemeral records only.'}}}};
  try{await readFile(join(root,'smoke-result.json'));throw new Error('Smoke already recorded');}catch(e:any){if(e.code!=='ENOENT')throw e;}
  await writeFile(join(root,'smoke-protocol.json'),JSON.stringify({config,payload},null,2));const response=await new DecisionsClient(root,config).call(payload.state,payload.questions,'smoke');await writeFile(join(root,'smoke-result.json'),JSON.stringify(response,null,2));console.log(JSON.stringify(response));
 }else if(cmd==='freeze'){
  try{await readFile(join(root,'frozen.json'));throw new Error('Already frozen');}catch(e:any){if(e.code!=='ENOENT')throw e;}
  const checks=JSON.parse(await readFile(join(root,'validation-results.json'),'utf8'));if(!checks.unit_passed||!checks.compiler_control_passed)throw new Error('Preflight must pass');await writeFile(join(root,'frozen.json'),JSON.stringify({milestone:'M1 — Jev Decision Mesh',frozen_at:new Date().toISOString(),files:await fingerprint()},null,2));console.log('M1 frozen.');
 }else if(cmd==='run'){
  const frozen=JSON.parse(await readFile(join(root,'frozen.json'),'utf8'));if(JSON.stringify(frozen.files)!==JSON.stringify(await fingerprint()))throw new Error('Frozen protocol changed');try{await readFile(join(root,'RESULTS.json'));throw new Error('Real run already exists; no selection reruns');}catch(e:any){if(e.code!=='ENOENT')throw e;}
  process.loadEnvFile(resolve(root,'..','.env'));await run(root);await previous();
 }else throw new Error('Commands: smoke, freeze, run');
}catch(e:any){console.error(e.category??'error',e.message);process.exitCode=1;}
