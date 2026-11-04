import {readFile,writeFile,mkdir,appendFile,open,unlink} from 'node:fs/promises';import {join} from 'node:path';
export type Question={type:'choice'|'noul';instructions:string;criteria:Record<string,string>};
export class DecisionsClient {
 root:string;config:any;constructor(root:string,config:any){this.root=root;this.config=config;}
 async call(state:unknown,questions:Record<string,Question>,phase:string){
  const key=process.env.OPENROUTER_API_KEY;if(!key)throw new Error('Missing OPENROUTER_API_KEY');
  const config=this.config,payload={model:config.model,state,questions,provider:{allow_fallbacks:false}};
  const text=JSON.stringify(payload),count=Object.keys(questions).length;
  if(!count||count>config.max_questions_per_request||Buffer.byteLength(text)>config.max_payload_bytes)throw new Error('Request size/question budget exceeded');
  for(const q of Object.values(questions))if(!['choice','noul'].includes(q.type)||!q.instructions||Object.keys(q.criteria).length<2)throw new Error('Invalid Decisions question');
  const upperTokens=count*(Buffer.byteLength(JSON.stringify(state))+1024)+Buffer.byteLength(JSON.stringify(questions));
  const reserved=upperTokens*config.price_usd_per_input_token;
  const lock=join(this.root,'.openrouter-budget.lock');const handle=await open(lock,'wx').catch(()=>{throw new Error('Budget ledger locked');});let ledger:any;
  try{try{ledger=JSON.parse(await readFile(join(this.root,'.openrouter-budget.json'),'utf8'));}catch(e:any){if(e.code!=='ENOENT')throw e;ledger={requests:0,reserved_usd:0,actual_usd:0,unknown_cost:false};}
   if(ledger.unknown_cost||ledger.requests>=config.max_requests||ledger.reserved_usd+reserved>config.max_cost_usd)throw new Error('Cost/request cap exhausted or prior cost unknown');
   ledger.requests++;ledger.reserved_usd+=reserved;await writeFile(join(this.root,'.openrouter-budget.json'),JSON.stringify(ledger,null,2));
  }finally{await handle.close();await unlink(lock);}
  await mkdir(join(this.root,'runs'),{recursive:true});const id=`${Date.now()}-${phase}`,trace=join(this.root,'runs','provider.jsonl');
  const safe=(v:any)=>JSON.parse(JSON.stringify(v).split(key).join('[REDACTED]'));
  await appendFile(trace,JSON.stringify({id,event:'request',phase,requested_model:config.model,payload,reserved_usd:reserved})+'\n');
  const start=performance.now();let response:Response;
  try{response=await fetch(config.endpoint,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:text,signal:AbortSignal.timeout(config.request_timeout_ms)});}catch(e:any){ledger.unknown_cost=true;await writeFile(join(this.root,'.openrouter-budget.json'),JSON.stringify(ledger,null,2));await appendFile(trace,JSON.stringify({id,event:'transport_error',name:e.name,latency_ms:performance.now()-start})+'\n');throw new Error('Decisions transport failed; further paid requests blocked');}
  const bodyText=await response.text();let body:any;try{body=JSON.parse(bodyText);}catch{body={non_json:safe(bodyText)};}
  const latency_ms=performance.now()-start;await appendFile(trace,JSON.stringify(safe({id,event:'response',phase,status:response.status,latency_ms,raw:body}))+'\n');
  const cost=body.usage?.cost;if(typeof cost==='number'&&Number.isFinite(cost)&&cost>=0)ledger.actual_usd+=cost;else ledger.unknown_cost=true;
  if(typeof cost==='number'&&cost>reserved)ledger.unknown_cost=true;
  await writeFile(join(this.root,'.openrouter-budget.json'),JSON.stringify(ledger,null,2));
  if(!response.ok)throw new Error(`Decisions HTTP ${response.status}: ${safe(body.error?.message??'provider error')}`);
  if(!body.model?.startsWith(config.model)||!body.answers||typeof cost!=='number')throw new Error('Missing model/answers/cost; further requests blocked');
  const decisions:Record<string,any>={};
  for(const [name,q] of Object.entries(questions)){
   const a=body.answers[name];if(!a||a.type!==q.type)throw new Error('Invalid typed answer: '+name);
   if(q.type==='choice'){
    if(!Object.hasOwn(q.criteria,a.choice)||!a.probabilities||Object.keys(q.criteria).some(k=>!Number.isFinite(a.probabilities[k])||a.probabilities[k]<0||a.probabilities[k]>1))throw new Error('Invalid choice/probabilities: '+name);
    decisions[name]={value:a.choice,probabilities:a.probabilities,confidence:a.confidence??null,type:a.type};
   }else{if(!Number.isFinite(a.noul)||a.noul<0||a.noul>1)throw new Error('Invalid noul: '+name);decisions[name]={value:a.noul>=config.noul_threshold,probability:a.noul,type:a.type};}
  }
  return {decisions,model:body.model,cost_usd:cost,latency_ms,usage:body.usage,id:body.id,provider:body.provider};
 }
}
