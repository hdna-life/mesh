import type {DecisionsClient} from '../../m1/src/provider.ts';
type Job={id:string;role:string;questions:number;state:any;q:any;resolve:(v:any)=>void;reject:(e:any)=>void};
export class Router{
 client:DecisionsClient;config:any;worker:any;log:any;queue:Job[]=[];busy=false;scheduled=false;aborted=false;sequence=0;routes:any[]=[];completed:string[]=[];routerCalls=0;
 constructor(client:DecisionsClient,config:any,log:any){this.client=client;this.config=config;this.log=log;}
 submit(state:any,q:any,role:string){if(this.aborted)return Promise.reject(new Error('dependency_aborted'));return new Promise((resolve,reject)=>{this.queue.push({id:`job-${++this.sequence}`,role,questions:Object.keys(q).length,state,q,resolve,reject});if(!this.scheduled){this.scheduled=true;queueMicrotask(()=>{this.scheduled=false;void this.drain();});}});}
 async select(roles:string[],metadata:any){
  const priority=this.config.deterministic_priority as string[];const deterministic=[...roles].sort((a,b)=>priority.indexOf(a)-priority.indexOf(b))[0];
  if(roles.length===1){const row={roles,selected:roles[0],deterministic,alternative_roles:1,jev_called:false,different_from_deterministic:false,...metadata};this.routes.push(row);await this.log('routing',row);return roles[0];}
  if(this.routerCalls>=this.config.max_router_requests)throw new Error('router_request_budget_exceeded');
  const state={ready_roles:roles,jobs:this.queue.filter(j=>roles.includes(j.role)).map(j=>({role:j.role,questions:j.questions,status:'ready'})),completed_roles:this.completed,goal:'Choose a ready expert to advance the dependency graph. Do not answer any semantic question.',...metadata};
  const result=await this.client.call(state,{route:{type:'choice',instructions:'Which currently ready expert role should run next? Route only; never supply or correct semantic values.',criteria:Object.fromEntries(roles.map(role=>[role,`Dispatch the ready ${role} expert.`]))}},'coordinator');this.routerCalls++;
  const selected=result.decisions.route.value;const row={roles,selected,deterministic,alternative_roles:roles.length,jev_called:true,different_from_deterministic:selected!==deterministic,response:result,...metadata};this.routes.push(row);await this.log('routing',row);return selected;
 }
 async repair(role:string,code:string){
  // A malformed decision has only its owning role as a legal repair target. No paid fake choice.
  await this.select([role],{reason:'targeted_repair',error_code:code,owner_role:role});
 }
 async drain(){if(this.busy||this.aborted)return;this.busy=true;
  try{while(this.queue.length){const roles=[...new Set(this.queue.map(j=>j.role))];const selected=await this.select(roles,{reason:'ready_graph'});const index=this.queue.findIndex(j=>j.role===selected);const job=this.queue.splice(index,1)[0];
    try{const result=await this.worker(job.state,job.q,job.role);this.completed.push(job.role);job.resolve(result);}catch(e){job.reject(e);throw e;}
    // Allow a resolved continuation to enqueue newly available graph work.
    await Promise.resolve();
  }}catch(e){this.aborted=true;for(const job of this.queue.splice(0))job.reject(e);await this.log('routing_abort',{message:(e as any).message});}
  finally{this.busy=false;}
 }
}
