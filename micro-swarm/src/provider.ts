import {readFile,writeFile,mkdir,open,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {Failure,MODEL,type Files} from './contracts.ts';
export type Message={role:string;content:string};
export type Reply={raw:string;input_tokens:number|null;output_tokens:number|null;status:number;latency_ms:number;provider:string;provider_metadata?:unknown};
export class Budget {
 calls=0;inputUpper=0;outputReserved=0;actualInput=0;actualOutput=0;usageComplete=true;
 maxCalls:number;maxTokens:number;maxOutput:number;
 constructor(maxCalls=6,maxTokens=48000,maxOutput=8192){this.maxCalls=maxCalls;this.maxTokens=maxTokens;this.maxOutput=maxOutput;}
 reserve(messages:Message[], output:number) {
  const input=Buffer.byteLength(JSON.stringify(messages))+256;
  if(output<1||this.calls>=this.maxCalls||this.inputUpper+input+this.outputReserved+output>this.maxTokens||this.outputReserved+output>this.maxOutput)throw new Failure('budget_exceeded','Run request/token budget exceeded (UTF-8 byte upper bounds)');
  this.calls++;this.inputUpper+=input;this.outputReserved+=output;return input;
 }
}
export async function reserveDaily(root:string,input:number,output:number) {
 const lock=join(root,'.budget.lock');let handle;
 try {handle=await open(lock,'wx');} catch {throw new Failure('budget_exceeded','Budget ledger locked; inspect stale lock manually');}
 try {
  const file=join(root,'.budget.json'),day=new Date().toISOString().slice(0,10);
  let ledger:any={day,neurons:0,calls:0};try{const v=JSON.parse(await readFile(file,'utf8'));if(v.day===day)ledger=v;}catch(e:any){if(e.code!=='ENOENT')throw e;}
  const neurons=input*2457/1e6+output*18252/1e6;
  const cap=Number(process.env.MAX_DAILY_NEURONS||1000);
  if(!Number.isFinite(cap)||cap<=0||cap>10000||ledger.neurons+neurons>cap)throw new Failure('budget_exceeded','Daily neuron reservation exhausted');
  ledger.calls++;ledger.neurons+=neurons;await writeFile(file,JSON.stringify(ledger,null,2));return {reserved_neurons:neurons,ledger};
 } finally {await handle.close();await import('node:fs/promises').then(fs=>fs.unlink(lock));}
}
export class Client {
 batchCalls=0;
 kind:string;root:string;mockFiles:Files;replay:Reply[];
 constructor(kind:string,root:string,mockFiles:Files,replay:Reply[]=[]){this.kind=kind;this.root=root;this.mockFiles=mockFiles;this.replay=replay;}
 async call(messages:Message[],max_tokens:number,seed:number,inputUpper:number,role:string):Promise<Reply> {
  if(this.kind==='mock') {
   const files=role==='schema'?[{path:'schema.sql',content:'CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0);'}]:role==='repair'?[]:Object.entries(this.mockFiles).map(([path,content])=>({path,content}));
   return {raw:JSON.stringify({result:{files},requirements:[],proposed_tasks:[],assumptions:['SYNTHETIC GOLD FIXTURE: infrastructure test only']}),input_tokens:null,output_tokens:null,status:200,latency_ms:0,provider:'mock'};
  }
  if(this.kind==='replay') {const r=this.replay.shift();if(!r)throw new Failure('provider_error','Replay exhausted');return {...r,provider:'replay',latency_ms:0};}
  if(this.kind!=='cloudflare')throw new Failure('provider_error','Unknown provider');
  const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
  if(!account||!token)throw new Failure('provider_error','Missing CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN');
  if(!/^[a-f0-9]{32}$/i.test(account))throw new Failure('provider_error','Invalid account ID');
  if(process.env.CLOUDFLARE_WORKERS_FREE!=='true')throw new Failure('budget_exceeded','Confirm Workers Free plan with CLOUDFLARE_WORKERS_FREE=true; paid plans are not enabled');
  const batchMax=Number(process.env.MAX_BATCH_CALLS||12);
  if(!Number.isInteger(batchMax)||batchMax<1||batchMax>120||this.batchCalls>=batchMax)throw new Failure('budget_exceeded','Batch call budget exhausted');
  const reservation=await reserveDaily(this.root,inputUpper,max_tokens);this.batchCalls++;
  const start=performance.now();
  let response:Response;
  try {response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${MODEL}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messages,max_tokens,temperature:0,seed,stream:false}),signal:AbortSignal.timeout(30000)});}catch(e:any){throw new Failure(e.name==='TimeoutError'?'timeout':'provider_error',`Provider transport failed (${e.name}); reservation retained`);}
  const bodyText=await response.text();
  let body:any;try{body=JSON.parse(bodyText);}catch{body={};}
  // Do not persist provider headers or request authorization. Raw response text refers only to model output.
  if(!response.ok||body.success===false||typeof body.result?.response!=='string') {
   const err:any=new Failure('provider_error',`Cloudflare status=${response.status}, codes=${JSON.stringify(body.errors?.map((e:any)=>e.code)||[])}`);
   err.status=response.status;err.latency_ms=performance.now()-start;throw err;
  }
  const usage=body.result.usage;
  return {raw:body.result.response,input_tokens:usage?.prompt_tokens??null,output_tokens:usage?.completion_tokens??null,status:response.status,latency_ms:performance.now()-start,provider:'cloudflare',provider_metadata:{reservation,usage:usage??null,model_version:body.result.model??null}};
 }
}
