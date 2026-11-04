import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,mkdir,symlink,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseResponse,contract} from '../src/contracts.ts';
import {plan,registry} from '../src/graph.ts';
import {Budget,Client,reserveDaily} from '../src/provider.ts';
import {writeArtifacts} from '../src/artifacts.ts';
const response=(files:any[]=[])=>JSON.stringify({result:{files},requirements:[],proposed_tasks:[],assumptions:[]});
test('strict JSON errors are not silently repaired',()=>{assert.throws(()=>parseResponse('```json\n'+response()+'\n```'),{category:'parse_error'});assert.throws(()=>parseResponse('{}'),{category:'schema_violation'});});
test('reject paths, duplicate files and malformed requirements',()=>{
 for(const path of ['../app.py','/app.py','a/../app.py','x.py'])assert.throws(()=>parseResponse(response([{path,content:'x'}])),{category:'schema_violation'});
 assert.throws(()=>parseResponse(response([{path:'app.py',content:'1'},{path:'app.py',content:'2'}])),{category:'schema_violation'});
 assert.equal(parseResponse(response([{path:'app.py',content:'x'}])).result.files.length,1);
});
test('backward chaining builds deterministic dependencies without LLM',()=>{assert.deepEqual(plan(['application.validated'],new Set(['spec.api_contract'])).map(c=>c.role),['schema','api','validation']);assert.deepEqual(plan(['database.schema'],new Set(['database.schema'])),[]);});
test('cycles, missing capabilities and depth/task budgets fail explicitly',()=>{
 assert.throws(()=>plan(['unknown'],new Set()),{category:'missing_capability'});
 const caps=[{id:'x',role:'x',requires:['b'],produces:['a']},{id:'y',role:'y',requires:['a'],produces:['b']}];
 assert.throws(()=>plan(['a'],new Set(),caps),{category:'dependency_cycle'});
 assert.throws(()=>plan(['application.validated'],new Set(['spec.api_contract']),registry,0),{category:'budget_exceeded'});
 assert.throws(()=>plan(['application.validated'],new Set(['spec.api_contract']),registry,8,2),{category:'budget_exceeded'});
});
test('per-run token and call reservations cannot overrun ceiling',()=>{
 const b=new Budget(1,1000,100);b.reserve([{role:'user',content:'x'}],100);assert.throws(()=>b.reserve([],1),{category:'budget_exceeded'});
 assert.throws(()=>new Budget(6,500,100).reserve([{role:'user',content:'x'.repeat(1000)}],1),{category:'budget_exceeded'});
});
test('daily ledger persists reservations and enforces cap',async()=>{
 const root=await mkdtemp(join(tmpdir(),'micro-ledger-'));const old=process.env.MAX_DAILY_NEURONS;process.env.MAX_DAILY_NEURONS='1';
 try{await reserveDaily(root,1,1);await assert.rejects(reserveDaily(root,1000,1000),{category:'budget_exceeded'});const v=JSON.parse(await readFile(join(root,'.budget.json'),'utf8'));assert.equal(v.calls,1);}
 finally{if(old===undefined)delete process.env.MAX_DAILY_NEURONS;else process.env.MAX_DAILY_NEURONS=old;await rm(root,{recursive:true,force:true});}
});
test('artifact writer refuses symlink destinations and traversal',async()=>{
 const root=await mkdtemp(join(tmpdir(),'micro-path-'));try{await writeFile(join(root,'outside'),'untouched');await symlink(join(root,'outside'),join(root,'app.py'));await assert.rejects(writeArtifacts(root,{'app.py':'oops'}),{category:'schema_violation'});assert.equal(await readFile(join(root,'outside'),'utf8'),'untouched');await assert.rejects(writeArtifacts(root,{'../escape':'x'}),{category:'schema_violation'});}finally{await rm(root,{recursive:true,force:true});}
});
test('mock is explicitly synthetic, not an unlabelled success',async()=>{const c=new Client('mock','/tmp',{'app.py':'fixture'});const r=await c.call([],100,42,100,'single');assert.equal(r.provider,'mock');assert.equal(r.input_tokens,null);assert.match(r.raw,/SYNTHETIC/);});
test('inventory contract contains transaction, race, idempotency and persistence requirements',()=>{const s=contract({id:'x',split:'development',max_name:80,max_stock:1000,max_quantity:100,descending:false,filter:false});for(const phrase of ['atomic transaction','concurrent requests','Idempotency','process restart','/reservations/<id>/cancel'])assert.ok(s.includes(phrase));});
