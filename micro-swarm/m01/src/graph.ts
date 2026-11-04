import {Failure} from './contracts.ts';
export type Capability={id:string;role:string;requires:string[];produces:string[]};
export const registry:Capability[]=[
 {id:'database.sqlite.schema',role:'schema',requires:['spec.api_contract'],produces:['database.schema']},
 {id:'http.api',role:'api',requires:['spec.api_contract','database.schema'],produces:['application.routes']},
 {id:'input.validation',role:'validation',requires:['application.routes'],produces:['application.validated']},
 {id:'code.repair',role:'repair',requires:['application.validated','execution.failure'],produces:['application.repaired']}
];
export function plan(goals:string[], available:Set<string>, caps=registry, maxDepth=8,maxTasks=8) {
 const result:Capability[]=[],visiting=new Set<string>(),done=new Set(available);
 const visit=(artifact:string,depth:number)=>{
  if(done.has(artifact))return;
  if(depth>maxDepth)throw new Failure('budget_exceeded','Graph max depth');
  if(visiting.has(artifact))throw new Failure('dependency_cycle',artifact);
  const cap=caps.find(c=>c.produces.includes(artifact));
  if(!cap)throw new Failure('missing_capability',artifact);
  visiting.add(artifact);for(const need of cap.requires)visit(need,depth+1);visiting.delete(artifact);
  if(!result.some(c=>c.id===cap.id))result.push(cap);
  if(result.length>maxTasks)throw new Failure('budget_exceeded','Graph max tasks');
  cap.produces.forEach(a=>done.add(a));
 };
 goals.forEach(a=>visit(a,0));return result;
}
