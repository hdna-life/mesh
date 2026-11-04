import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execute} from '../src/execution.ts';
const root=resolve(import.meta.dirname,'..');
const gold=await readFile(join(root,'fixtures/gold.py'),'utf8');
const scenario={id:'calibration',split:'development',max_name:80,max_stock:1000,max_quantity:100,descending:false,filter:false};
const mutations=[
 ['missing stock decrement',gold.replace("c.execute('UPDATE products SET stock=stock-? WHERE id=?',(v['quantity'],v['product_id']))",'pass')],
 ['cancel restores twice',gold.replace("if r['status']=='active':",'if True:')],
 ['restart loses data',gold.replace("MAX_NAME=int", "\nif os.path.exists(DB):os.unlink(DB)\nMAX_NAME=int")],
 ['boolean quantities accepted',gold.replace("type(v['quantity']) is not int","not isinstance(v['quantity'],int)")]
];
test('gold reference passes full HTTP, concurrency, restart and SQLite suite',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'micro-gold-'));try{await writeFile(join(dir,'app.py'),gold);const r=await execute(root,dir,scenario,'mock');assert.equal(r.evaluated,true,JSON.stringify(r));assert.equal(r.passed,true,JSON.stringify(r));assert.ok(r.tests.some((t:any)=>t.name==='concurrent_last_unit'&&t.pass));}finally{await rm(dir,{recursive:true,force:true});}
});
for(const [name,code] of mutations)test('acceptance suite rejects: '+name,async()=>{
 assert.notEqual(code,gold,'mutation must change fixture');const dir=await mkdtemp(join(tmpdir(),'micro-mutant-'));try{await writeFile(join(dir,'app.py'),code);const r=await execute(root,dir,scenario,'mock');assert.equal(r.evaluated,true,JSON.stringify(r));assert.equal(r.passed,false,'broken fixture must fail');assert.ok(r.tests.some((t:any)=>!t.pass));}finally{await rm(dir,{recursive:true,force:true});}
});
