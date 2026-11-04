import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {child} from '../../m01/src/execution.ts';
import type {Scenario} from './contracts.ts';
import type {Check} from './engine.ts';
export const python=(root:string)=>resolve(root,'..','.venv/bin/python');
export function checkFile(root:string,kind:string,path:string):{passed:boolean;checks:Check[]} {
 const r=spawnSync(python(root),[join(root,'benchmarks/checker.py'),kind,path,join(root,'contract.json')],{encoding:'utf8',timeout:4000,maxBuffer:200000,env:{PATH:'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'}});
 if(r.error||r.status!==0)return {passed:false,checks:[{name:'checker_execution',pass:false,error:r.error?.message||r.stderr}]};
 try{return JSON.parse(r.stdout);}catch{return {passed:false,checks:[{name:'checker_output',pass:false,error:r.stdout.slice(-2000)}]};}
}
export async function execute(root:string,dir:string,scenario:Scenario,mode='acceptance',fixture=false) {
 const env:Record<string,string>={PATH:'/usr/bin:/bin',HOME:'/tmp',PYTHONDONTWRITEBYTECODE:'1'};if(fixture)env.FIXTURE_MODE='1';
 const r=await child(python(root),[join(root,'benchmarks/runner.py'),JSON.stringify(scenario),dir,mode],root,env);
 if(r.timedOut)return {passed:false,evaluated:false,tests:[],category:'timeout',stdout_stderr:r.stderr,elapsed_ms:35000};
 try{const out=JSON.parse(r.stdout);if(out.database_base64){await writeFile(join(dir,'verified.sqlite'),Buffer.from(out.database_base64,'base64'));delete out.database_base64;}return out;}
 catch{return {passed:false,evaluated:false,category:'runner_error',tests:[],stdout_stderr:r.stderr||r.stdout,elapsed_ms:0};}
}
export async function stage(dir:string,files:Record<string,string>){await mkdir(dir,{recursive:true});for(const [name,text] of Object.entries(files)){if(!['app.py','schema.sql','validation.py'].includes(name))throw new Error('Unsafe staged artifact');await writeFile(join(dir,name),text,{mode:0o600});}}
