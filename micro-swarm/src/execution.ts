import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import type {Scenario} from './contracts.ts';
export async function child(command:string,args:string[],cwd:string,env:Record<string,string>,timeout=35000) {
 return await new Promise<{code:number|null;stdout:string;stderr:string;timedOut:boolean}>((res,rej)=>{
  const p=spawn(command,args,{cwd,env,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});let stdout='',stderr='',timedOut=false,settled=false;
  const kill=()=>{try{process.kill(-p.pid!,'SIGKILL');}catch{p.kill('SIGKILL');}};
  const timer=setTimeout(()=>{timedOut=true;kill();},timeout);
  p.stdout.on('data',x=>{stdout+=x;if(stdout.length>2e6)kill();});p.stderr.on('data',x=>{stderr+=x;if(stderr.length>1e5)kill();});
  p.on('error',e=>{clearTimeout(timer);if(!settled){settled=true;rej(e);}});
  p.on('close',code=>{clearTimeout(timer);if(!settled){settled=true;res({code,stdout:stdout.slice(0,2e6),stderr:stderr.slice(-32000),timedOut});}});
 });
}
export async function execute(root:string,dir:string,scenario:Scenario,provider:string) {
 const python=resolve(root,process.env.PYTHON||'.venv/bin/python');
 const env:Record<string,string>={PATH:'/usr/bin:/bin',HOME:'/tmp',PYTHONDONTWRITEBYTECODE:'1'};
 if(provider==='mock')env.FIXTURE_MODE='1';
 const r=await child(python,[join(root,'benchmarks/runner.py'),JSON.stringify(scenario),dir],root,env);
 if(r.timedOut)return {passed:false,evaluated:true,category:'timeout',tests:[],stdout_stderr:r.stderr,exit_code:r.code,elapsed_ms:35000};
 let out:any;try{out=JSON.parse(r.stdout);}catch{return {passed:false,evaluated:false,category:'runtime_error',tests:[],stdout_stderr:r.stderr||r.stdout,exit_code:r.code,elapsed_ms:0};}
 if(out.database_base64){await writeFile(join(dir,'verified.sqlite'),Buffer.from(out.database_base64,'base64'));delete out.database_base64;}
 return {...out,category:out.category??(out.passed?null:(out.tests.some((t:any)=>t.name==='startup_or_required_setup'&&!t.pass)?'runtime_error':'test_failure'))};
}
