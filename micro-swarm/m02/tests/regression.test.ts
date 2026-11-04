import test from 'node:test';import assert from 'node:assert/strict';import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';import {execute,checkFile} from '../src/validation.ts';
const root=resolve(import.meta.dirname,'..');const gold=await readFile(join(root,'fixtures/gold.py'),'utf8');const scenario={id:'calibration',split:'development',max_name:80,max_stock:1000,max_quantity:100,descending:false,filter:false};
const variants=[['gold',gold,true],['stock decrement missing',gold.replace("c.execute('UPDATE products SET stock=stock-? WHERE id=?',(v['quantity'],v['product_id']))",'pass'),false],['double cancel refund',gold.replace("if r['status']=='active':",'if True:'),false],['data erased on restart',gold.replace('MAX_NAME=int',"\nif os.path.exists(DB):os.unlink(DB)\nMAX_NAME=int"),false],['boolean quantity accepted',gold.replace("type(v['quantity']) is not int","not isinstance(v['quantity'],int)"),false]] as const;
for(const [name,source,expected] of variants)test('unchanged acceptance suite: '+name,async()=>{const dir=await mkdtemp(join(tmpdir(),'m02-regression-'));try{await writeFile(join(dir,'app.py'),source);const r=await execute(root,dir,scenario,'acceptance',true);assert.equal(r.evaluated,true,JSON.stringify(r));assert.equal(r.passed,expected,JSON.stringify(r));if(expected){assert.equal(checkFile(root,'api_single',join(dir,'app.py')).passed,true);assert.ok(r.tests.some((t:any)=>t.name==='concurrent_last_unit'&&t.pass));assert.ok(r.tests.some((t:any)=>t.name==='restart_persistence_and_idempotency'&&t.pass));}}finally{await rm(dir,{recursive:true,force:true});}});
// Private validator calibration; never imported by the experiment or sent to inference.
const validationReference=String.raw`import re
def validate_product(data):
    if not isinstance(data,dict) or set(data)!={'sku','name','stock'}:return None,'shape'
    sku,name,stock=data['sku'],data['name'],data['stock']
    if not isinstance(sku,str) or not re.fullmatch(r'[A-Z0-9-]{1,16}',sku):return None,'sku'
    if not isinstance(name,str) or not 1<=len(name.strip())<=80:return None,'name'
    if type(stock) is not int or not 0<=stock<=1000:return None,'stock'
    return {'sku':sku,'name':name.strip(),'stock':stock},None
def validate_reservation(data):
    if not isinstance(data,dict) or set(data)!={'product_id','quantity','request_key'}:return None,'shape'
    if type(data['product_id']) is not int or data['product_id']<=0:return None,'id'
    if type(data['quantity']) is not int or not 1<=data['quantity']<=100:return None,'quantity'
    if not isinstance(data['request_key'],str) or not re.fullmatch(r'[A-Za-z0-9-]{1,64}',data['request_key']):return None,'key'
    return dict(data),None
def validate_cancel(data):
    return ({},None) if isinstance(data,dict) and not data else (None,'shape')
`;
for(const broken of [false,true])test('sandbox validation-module calibration '+(broken?'rejects broken':'accepts correct'),async()=>{const d=await mkdtemp(join(tmpdir(),'m02-module-'));try{await writeFile(join(d,'validation.py'),broken?validationReference.replace("type(data['quantity']) is not int","not isinstance(data['quantity'],int)"):validationReference);const r=await execute(root,d,scenario,'validation');assert.equal(r.evaluated,true,JSON.stringify(r));assert.equal(r.passed,!broken,JSON.stringify(r));assert.ok(r.tests.length>=25);}finally{await rm(d,{recursive:true,force:true});}});
