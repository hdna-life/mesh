# Generic relational IR executor. This file contains no benchmark names or task-specific branches.
import os,sqlite3,re
from flask import Flask,request,jsonify
from werkzeug.exceptions import HTTPException

def build(ir):
    app=Flask(__name__);entities={e['name']:e for e in ir['entities']}
    def ident(s):return '"'+s+'"'
    def connect():
        c=sqlite3.connect(os.environ['DATABASE_PATH'],timeout=5,isolation_level=None);c.row_factory=sqlite3.Row;c.execute('PRAGMA foreign_keys=ON');return c
    def primary(entity):return next(f['name'] for f in entities[entity]['fields'] if f['primary'])
    def record(entity,row):
        if row is None:return None
        result=dict(row)
        for f in entities[entity]['fields']:
            if f['type']=='boolean' and result[f['name']] is not None:result[f['name']]=bool(result[f['name']])
        return result
    with connect() as c:
        for entity in ir['entities']:
            columns=[]
            for f in entity['fields']:
                typ={'integer':'INTEGER','text':'TEXT','boolean':'INTEGER'}[f['type']];definition=ident(f['name'])+' '+typ
                if f['primary']:definition+=' PRIMARY KEY AUTOINCREMENT'
                elif f['required']:definition+=' NOT NULL'
                if f['unique'] and not f['primary']:definition+=' UNIQUE'
                columns.append(definition)
            for link in ir['relationships']:
                if link['entity']==entity['name']:columns.append('FOREIGN KEY('+ident(link['field'])+') REFERENCES '+ident(link['target'])+'('+ident(link['target_field'])+')')
            c.execute('CREATE TABLE IF NOT EXISTS '+ident(entity['name'])+'('+','.join(columns)+')')
    class Rejected(Exception):
        def __init__(self,code):self.code=code
    def expr(node,env):
        if 'lit' in node:return node['lit']
        if 'ref' in node:
            parts=node['ref'].split('.');value=env
            for part in parts:value=value[part]
            return value
        args=[expr(a,env) for a in node['args']];op=node['calc']
        if op=='add':return args[0]+args[1]
        if op=='sub':return args[0]-args[1]
        if op=='ge':return args[0]>=args[1]
        if op=='le':return args[0]<=args[1]
        if op=='eq':return args[0]==args[1]
        if op=='ne':return args[0]!=args[1]
        if op=='and':return all(args)
        raise Rejected('internal')
    def validate(schema):
        if not schema['fields']:
            data=request.get_json(silent=True) if request.method not in ['GET','HEAD'] else {}
        else:data=request.get_json(silent=True)
        if not isinstance(data,dict):raise Rejected('invalid')
        allowed={f['name'] for f in schema['fields']}
        if schema['exact'] and not set(data).issubset(allowed):raise Rejected('invalid')
        result={}
        for f in schema['fields']:
            name=f['name']
            if name not in data:
                if f['required']:raise Rejected('invalid')
                continue
            value=data[name];typ=f['type']
            if typ=='integer' and type(value) is not int:raise Rejected('invalid')
            if typ=='boolean' and type(value) is not bool:raise Rejected('invalid')
            if typ=='text' and not isinstance(value,str):raise Rejected('invalid')
            if typ=='text':
                if f['trim']:value=value.strip()
                if f['min_length'] is not None and len(value)<f['min_length']:raise Rejected('invalid')
                if f['max_length'] is not None and len(value)>f['max_length']:raise Rejected('invalid')
                if f['pattern'] is not None and re.fullmatch(f['pattern'],value) is None:raise Rejected('invalid')
            elif typ=='integer':
                if f['min'] is not None and value<f['min']:raise Rejected('invalid')
                if f['max'] is not None and value>f['max']:raise Rejected('invalid')
            result[name]=value
        return result
    def fetch(c,entity,key):return record(entity,c.execute('SELECT * FROM '+ident(entity)+' WHERE '+ident(primary(entity))+'=?',(key,)).fetchone())
    def execute(op,path):
        data=validate(op['input']);env={'input':data,'path':path};entity=op['entity'];c=connect()
        try:
            if op['atomic']:c.execute('BEGIN IMMEDIATE')
            if op['kind']=='list':
                query='SELECT * FROM '+ident(entity)
                if op['order']:query+=' ORDER BY '+','.join(ident(x['field'])+' '+x['direction'] for x in op['order'])
                value=[record(entity,r) for r in c.execute(query)];status=op['success_status']
            elif op['kind']=='get':
                value=fetch(c,entity,expr(op['key'],env));status=op['success_status']
                if value is None:raise Rejected('missing')
            else:
                idem=op['idempotency']
                if idem is not None:
                    row=c.execute('SELECT * FROM '+ident(entity)+' WHERE '+ident(idem['field'])+'=?',(expr(idem['input'],env),)).fetchone()
                    if row is not None:
                        value=record(entity,row)
                        for col,node in op['values'].items():
                            if 'ref' in node and node['ref'].startswith('input.') and value[col]!=expr(node,env):raise Rejected('conflict')
                        c.commit();return value,idem['replay_status']
                if op['kind']=='transition':
                    row=fetch(c,entity,expr(op['key'],env))
                    if row is None:raise Rejected('missing')
                    env['row']=row;state=op['transition']
                    if row[state['field']]==state['to'] and state['on_repeat']=='return':c.commit();return row,state['repeat_status']
                    if row[state['field']]!=state['from']:raise Rejected('conflict')
                for lookup in op['lookups']:
                    row=fetch(c,lookup['entity'],expr(lookup['key'],env))
                    if row is None:raise Rejected('missing')
                    env[lookup['as']]=row
                for guard in op['guards']:
                    if not expr(guard['expr'],env):raise Rejected(guard['error'])
                for effect in op['effects']:
                    alias=effect['record'];target=entity if alias=='row' else next(x['entity'] for x in op['lookups'] if x['as']==alias)
                    values={k:expr(v,env) for k,v in effect['values'].items()}
                    c.execute('UPDATE '+ident(target)+' SET '+','.join(ident(k)+'=?' for k in values)+' WHERE '+ident(primary(target))+'=?',list(values.values())+[env[alias][primary(target)]])
                    env[alias].update(values)
                if op['kind']=='transition':
                    state=op['transition'];c.execute('UPDATE '+ident(entity)+' SET '+ident(state['field'])+'=? WHERE '+ident(primary(entity))+'=?',(state['to'],env['row'][primary(entity)]));value=fetch(c,entity,env['row'][primary(entity)])
                else:
                    values={k:expr(v,env) for k,v in op['values'].items()};cur=c.execute('INSERT INTO '+ident(entity)+'('+','.join(ident(k) for k in values)+') VALUES('+','.join('?' for _ in values)+')',list(values.values()));value=fetch(c,entity,cur.lastrowid)
                status=op['success_status']
            c.commit();return value,status
        except Exception:
            c.rollback();raise
        finally:c.close()
    def handler(op):
        def route(**params):
            try:
                value,status=execute(op,params)
                project=lambda row:{key:row[key] for key in op['response_fields']}
                value=[project(row) for row in value] if isinstance(value,list) else project(value)
                return jsonify(value),status
            except Rejected as e:return jsonify(error=e.code),ir['errors'][e.code]
            except sqlite3.IntegrityError:return jsonify(error='conflict'),ir['errors']['conflict']
            except Exception:return jsonify(error='internal'),ir['errors']['internal']
        return route
    operations={o['id']:o for o in ir['operations']}
    for i,http in enumerate(ir['http']):app.add_url_rule(http['path'],'ir_'+str(i),handler(operations[http['operation']]),methods=[http['method']])
    @app.errorhandler(HTTPException)
    def http_error(e):return jsonify(error=e.name),e.code
    return app
