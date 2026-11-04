"""Static Python/interface checks + real SQLite schema checks. Never imports generated Python."""
import sys,json,ast,sqlite3,re,resource
from collections import Counter
resource.setrlimit(resource.RLIMIT_CPU,(2,2))
kind,path,policy_path=sys.argv[1:4];policy=json.load(open(policy_path));source=open(path).read() if kind!='database' else '';checks=[]
def check(name,passed,detail=None):checks.append(dict(name=name,pass_=bool(passed),detail=detail))
def tokens(sql):
    # Strings/comments are not identifiers. Quoted SQLite identifiers are supported.
    pattern=r"--[^\n]*|/\*[\s\S]*?\*/|'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|`[^`]*`|\[[^\]]*\]|[A-Za-z_][A-Za-z_0-9]*|[^\s]"
    result=[]
    for m in re.finditer(pattern,sql):
        v=m.group()
        if v.startswith(('--','/*',"'")):continue
        if v.startswith(('"','`','[')):v=v[1:-1]
        result.append(v.lower())
    return result
def definitions(sql):
    ts=tokens(sql);out=[]
    for i,t in enumerate(ts):
        if t!='create':continue
        j=i+1
        if j<len(ts) and ts[j] in ['temp','temporary']:j+=1
        if j>=len(ts) or ts[j]!='table':continue
        j+=1
        if ts[j:j+3]==['if','not','exists']:j+=3
        if j<len(ts):
            if j+2<len(ts) and ts[j+1]=='.':j+=2
            out.append(ts[j])
    return out

def inspect_db(db):
    db.row_factory=sqlite3.Row
    names={r['name'] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    for table,spec in policy['schema']['tables'].items():
        check('table:'+table,table in names)
        if table not in names:continue
        columns={r['name']:r for r in db.execute('PRAGMA table_info('+table+')')}
        for name,typ in spec['columns'].items():check('column:'+table+'.'+name,name in columns and columns[name]['type'].upper()==typ)
        check('primary_key:'+table,spec['primary_key'] in columns and columns[spec['primary_key']]['pk']==1)
        indexes=db.execute('PRAGMA index_list('+table+')').fetchall()
        unique_sets=[{r['name'] for r in db.execute('PRAGMA index_info('+json.dumps(idx['name'])+')')} for idx in indexes if idx['unique']]
        for name in spec['unique']:check('unique:'+table+'.'+name,{name} in unique_sets)
    for fk in policy['schema']['foreign_keys']:
        if fk['table'] not in names:continue
        rows=db.execute('PRAGMA foreign_key_list('+fk['table']+')').fetchall()
        check('foreign_key:'+fk['table']+'.'+fk['column'],any(r['from']==fk['column'] and r['table']==fk['ref_table'] and r['to']==fk['ref_column'] for r in rows))

def schema(sql):
    counts=Counter(definitions(sql));check('duplicate_table_definitions',all(v==1 for v in counts.values()),dict(counts))
    db=sqlite3.connect(':memory:')
    allowed={sqlite3.SQLITE_CREATE_TABLE,sqlite3.SQLITE_CREATE_INDEX,sqlite3.SQLITE_READ,sqlite3.SQLITE_SELECT,sqlite3.SQLITE_TRANSACTION}
    def auth(action,a,b,c,d):
        if action in (sqlite3.SQLITE_INSERT,sqlite3.SQLITE_UPDATE):return sqlite3.SQLITE_OK if a in ['sqlite_master','sqlite_schema'] else sqlite3.SQLITE_DENY
        if action==sqlite3.SQLITE_PRAGMA:return sqlite3.SQLITE_OK if a=='foreign_keys' and (b is None or str(b).lower() in ['on','1']) else sqlite3.SQLITE_DENY
        if action==sqlite3.SQLITE_FUNCTION:return sqlite3.SQLITE_OK if b in ['length','trim','typeof','upper','lower','abs'] else sqlite3.SQLITE_DENY
        return sqlite3.SQLITE_OK if action in allowed else sqlite3.SQLITE_DENY
    db.set_authorizer(auth)
    try:db.executescript(sql);check('sqlite_first_apply',True)
    except Exception as e:check('sqlite_first_apply',False,str(e));return
    db.set_authorizer(lambda *args:sqlite3.SQLITE_OK);inspect_db(db)
    before=db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name").fetchall();before=[tuple(r) for r in before]
    db.set_authorizer(auth)
    try:
        db.executescript(sql);db.set_authorizer(lambda *args:sqlite3.SQLITE_OK)
        after=[tuple(r) for r in db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name")]
        check('migration_second_apply',after==before)
    except Exception as e:check('migration_second_apply',False,str(e))

def const(node,values):
    if isinstance(node,ast.Constant):return node.value
    if isinstance(node,ast.Name):return values.get(node.id)
    if isinstance(node,(ast.List,ast.Tuple)):return [const(x,values) for x in node.elts]
    if isinstance(node,ast.BinOp) and isinstance(node.op,ast.Add):
        a,b=const(node.left,values),const(node.right,values)
        if isinstance(a,str) and isinstance(b,str):return a+b
    return None

def canonical(path):return re.sub(r'<(?:int:)?[^>]+>','<int>',path)
try:
    if kind=='schema':schema(source)
    elif kind=='database':
        db=sqlite3.connect('file:'+path+'?mode=ro',uri=True);inspect_db(db)
    else:
        tree=ast.parse(source);check('python_syntax',True)
        values={}
        for node in tree.body:
            if isinstance(node,ast.Assign):
                for target in node.targets:
                    if isinstance(target,ast.Name):values[target.id]=const(node.value,values)
        if kind=='validation':
            functions={n.name:n for n in tree.body if isinstance(n,ast.FunctionDef)}
            for name in policy['validation_functions']:check('signature:'+name,name in functions and len(functions[name].args.args)==1 and functions[name].args.vararg is None and functions[name].args.kwarg is None)
            check('validation_no_flask_or_sqlite',not any(isinstance(n,(ast.Import,ast.ImportFrom)) and any(x in ast.unparse(n) for x in ['flask','sqlite3']) for n in ast.walk(tree)))
        else:
            routes=[];ddl=[]
            for node in ast.walk(tree):
                if isinstance(node,ast.Call) and isinstance(node.func,ast.Attribute):
                    attr=node.func.attr
                    if attr in ['route','get','post','put','patch','delete'] and node.args:
                        pathvalue=const(node.args[0],values)
                        methods=next((const(k.value,values) for k in node.keywords if k.arg=='methods'),['GET'] if attr=='route' else [attr.upper()])
                        if isinstance(pathvalue,str) and isinstance(methods,list):routes.extend({'method':str(m).upper(),'path':canonical(pathvalue),'line':node.lineno} for m in methods)
                    if attr=='add_url_rule' and node.args:
                        pathvalue=const(node.args[0],values);methods=next((const(k.value,values) for k in node.keywords if k.arg=='methods'),['GET'])
                        if isinstance(pathvalue,str) and isinstance(methods,list):routes.extend({'method':str(m).upper(),'path':canonical(pathvalue),'line':node.lineno} for m in methods)
                    if attr in ['execute','executescript'] and node.args:
                        value=const(node.args[0],values)
                        if isinstance(value,str) and definitions(value):ddl.append(value)
                    if attr=='open' or (isinstance(node.func,ast.Name) and node.func.id=='open'):pass
            for required in policy['routes']:check('route:'+required['method']+' '+required['path'],any(r['method']==required['method'] and r['path']==required['path'] for r in routes),routes)
            if kind=='api_split':
                check('ownership_no_embedded_schema',not ddl)
                imported={alias.asname or alias.name for n in tree.body if isinstance(n,ast.ImportFrom) and n.module=='validation' for alias in n.names}
                module_import=any(isinstance(n,ast.Import) and any(a.name=='validation' for a in n.names) for n in tree.body)
                calls={n.func.id for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Name)}
                calls.update(n.func.attr for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and isinstance(n.func.value,ast.Name) and n.func.value.id=='validation')
                for name in policy['validation_functions']:check('integration_call:'+name,(name in imported or module_import) and name in calls)
                check('ownership_no_validator_redefinition',not any(isinstance(n,ast.FunctionDef) and n.name in policy['validation_functions'] for n in tree.body))
                # File-system writes remain denied by the runtime sandbox even for dynamic paths.
                bad_writes=[]
                for n in ast.walk(tree):
                    if isinstance(n,ast.Call) and isinstance(n.func,ast.Name) and n.func.id=='open' and n.args:
                        name=const(n.args[0],values);mode=const(n.args[1],values) if len(n.args)>1 else next((const(k.value,values) for k in n.keywords if k.arg=='mode'),'r')
                        if isinstance(name,str) and name.split('/')[-1] in ['schema.sql','validation.py'] and isinstance(mode,str) and any(c in mode for c in 'wax+'):bad_writes.append(name)
                check('ownership_no_foreign_file_write',not bad_writes,bad_writes)
            elif ddl:schema('\n'.join(ddl))
            else:checks.append(dict(name='inline_schema_static',pass_=True,detail='unknown: no constant DDL; actual DB is checked after runtime'))
except Exception as e:check('checker_exception',False,type(e).__name__+': '+str(e))
for c in checks:c['pass']=c.pop('pass_')
print(json.dumps({'passed':bool(checks) and all(c['pass'] for c in checks),'checks':checks}))
