import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Failure} from './contracts.ts';
export type Language='python'|'sql';
export function extractSource(raw:string,language:Language) {
 if(Buffer.byteLength(raw)>128000||raw.includes('\0'))throw new Failure('extraction_error','Oversized source or NUL');
 const text=raw.replace(/^\uFEFF/,'').trim();if(!text)throw new Failure('extraction_error','Empty source');
 const lines=text.split(/\r?\n/),markers=lines.map((line,i)=>({line:line.trim(),i})).filter(x=>x.line.startsWith('```'));
 if(!markers.length)return {source:text+'\n',format:'raw'};
 if(markers.length!==2)throw new Failure('extraction_error','Expected one complete fenced block');
 const [a,b]=markers,allowed=language==='python'?['```','```python','```py']:['```','```sql','```sqlite'];
 if(!allowed.includes(a.line.toLowerCase())||b.line!=='```'||b.i<=a.i+1)throw new Failure('extraction_error','Invalid/empty/wrong-language fence');
 const source=lines.slice(a.i+1,b.i).join('\n').trim();if(!source)throw new Failure('extraction_error','Empty block');return {source:source+'\n',format:'fenced'};
}
const validator=String.raw`import sys,json,ast,sqlite3,resource
resource.setrlimit(resource.RLIMIT_CPU,(2,2))
source=sys.stdin.read()
try:
 if sys.argv[1]=='python':
  tree=ast.parse(source,filename='engine-owned.py')
  if not any(not isinstance(n,ast.Expr) or not isinstance(n.value,(ast.Constant,ast.Str)) for n in tree.body):raise ValueError('No source statements')
 else:
  if not source.lstrip().upper().startswith('CREATE'):raise ValueError('Schema must begin with CREATE')
  db=sqlite3.connect(':memory:');denied={sqlite3.SQLITE_ATTACH,sqlite3.SQLITE_DETACH,sqlite3.SQLITE_PRAGMA}
  db.set_authorizer(lambda action,a,b,c,d:sqlite3.SQLITE_DENY if action in denied else sqlite3.SQLITE_OK)
  db.executescript(source)
  if not {'products','reservations'}.issubset({r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}):raise ValueError('Required schema tables missing')
 print(json.dumps({'valid':True}))
except Exception as e:print(json.dumps({'valid':False,'error':type(e).__name__+': '+str(e)[:1000]}))
`;
export function validateSyntax(root:string,source:string,language:Language) {
 const r=spawnSync(resolve(root,'..','.venv/bin/python'),['-c',validator,language],{input:source,encoding:'utf8',timeout:3500,maxBuffer:32000,env:{PATH:'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'}});
 if(r.error||r.status!==0)return {valid:false,error:r.error?.message||r.stderr||`validator exit ${r.status}`};
 try{return JSON.parse(r.stdout) as {valid:boolean;error?:string};}catch{return {valid:false,error:'Invalid validator reply'};}
}
export async function extractAndValidate(root:string,raw:string,language:Language) {
 const result=extractSource(raw,language),syntax=validateSyntax(root,result.source,language);
 if(!syntax.valid)throw new Failure('syntax_error',syntax.error||'Invalid source');return {...result,sha256:createHash('sha256').update(result.source).digest('hex')};
}
