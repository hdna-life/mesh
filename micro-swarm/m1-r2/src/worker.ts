import {Client} from '../../m01/src/provider.ts';import type {Question} from '../../m1/src/provider.ts';
export function match(raw:string,q:Question):string{
 let text=raw.trim();if(/^`[^`]+`$/.test(text))text=text.slice(1,-1);const fence=text.match(/^```(?:json|text)?\s*\n([\s\S]*?)\n```$/i);if(fence)text=fence[1].trim();
 try{const value=JSON.parse(text);if(typeof value==='string'||typeof value==='boolean')text=String(value);}catch{}
 const choices=Object.keys(q.criteria);if(choices.includes(text))return text;const matches=choices.filter(c=>c.toLowerCase()===text.toLowerCase());if(matches.length===1)return matches[0];throw new Error('invalid_enum_response');
}
export class Experts{
 clients=new Map<string,Client>();config:any;shared:string;log:(event:string,data:any)=>Promise<void>;repair:(role:string,code:string)=>Promise<void>;calls=0;responses:any[]=[];decisions=new Map<string,any>();requested=new Map<string,any>();repairs=0;
 constructor(shared:string,config:any,log:any,repair:any){this.shared=shared;this.config=config;this.log=log;this.repair=repair;}
 async reconsider(id:string,reason:string){const item=this.requested.get(id);if(!item)throw new Error('Unknown repair decision');if(this.repairs>=this.config.max_repairs)throw new Error('repair_limit');this.repairs++;await this.repair(item.role,'cross_role_conflict');return this.answer(item.state,{[id]:item.question},item.role,{error:reason,previous_choice:this.decisions.get(id)?.selected});}
 async answer(state:any,questions:Record<string,Question>,role:string,initialFeedback:any=null){
  const decisions:Record<string,any>={};let lastId='';
  for(const [id,q] of Object.entries(questions)){
   this.requested.set(id,{id,role,type:q.type,options:Object.keys(q.criteria),state,question:q});let feedback:any=initialFeedback;
   while(true){
    if(this.calls>=this.config.max_worker_calls)throw new Error('worker_call_budget_exceeded');
    const messages=[{role:'system',content:`You are the ${role} semantic decision expert. Do NOT write code or explanations. Answer ONLY ONE exact option key. No planner. Your option keys: ${Object.keys(q.criteria).join(', ')}.`},{role:'user',content:JSON.stringify({state,question:q,previous_invalid:feedback})}];
    const inputUpper=Buffer.byteLength(JSON.stringify(messages))+256;await this.log('worker_request',{role,id,messages,input_token_upper:inputUpper,max_tokens:this.config.worker_output_tokens,seed:this.config.worker_seed});
    let client=this.clients.get(role);if(!client){client=new Client('cloudflare',this.shared,{});this.clients.set(role,client);}
    this.calls++;let reply;try{reply=await client.call(messages,this.config.worker_output_tokens,this.config.worker_seed,inputUpper,role);}catch(e:any){e.bottleneck={layer:'worker_provider',role,question:id,category:e.category??'transport_error',message:e.message};throw e;}lastId=`worker-${this.calls}`;this.responses.push({role,id,...reply});await this.log('worker_response',{role,id,worker_call:lastId,...reply});
    let selected:string;try{selected=match(reply.raw,q);}catch(e:any){
     await this.log('invalid_worker_decision',{role,id,category:'invalid_enum_response'});
     if(this.repairs>=this.config.max_repairs)throw Object.assign(new Error('invalid_enum_response: repair limit exhausted'),{bottleneck:{layer:'worker_protocol',role,question:id}});
     this.repairs++;await this.repair(role,'invalid_enum_response');feedback={raw:reply.raw,error:'Reply must be one of the exact allowed option keys. No prose or code.'};continue;
    }
    if(selected==='unsupported'){const unresolved={id,role,selected,value:selected,type:q.type,worker_call:lastId};this.decisions.set(id,unresolved);await this.log('unresolved_worker_decision',unresolved);if(this.repairs>=this.config.max_repairs)throw Object.assign(new Error('unsupported selection remains unresolved'),{bottleneck:{layer:'worker_semantics',role,question:id}});this.repairs++;await this.repair(role,'unsupported_selection');feedback={raw:reply.raw,error:'The decision remains unresolved. Reconsider using the original requirement only; keep unsupported if not justified.'};continue;}
    const answer={value:q.type==='noul'?selected==='true':selected,type:q.type,worker_call:lastId};decisions[id]=answer;this.decisions.set(id,{id,role,selected,...answer});await this.log('worker_decision',{id,role,...answer});break;
   }
  }
  return {id:lastId,model:this.config.worker_model,decisions};
 }
}
