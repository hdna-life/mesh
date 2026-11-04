"""Trusted inventory acceptance runner. Tests never enter model prompts.
Each untrusted app process runs under macOS Seatbelt. No Docker.
"""
import os, sys, json, shutil, tempfile, subprocess, time, urllib.request, urllib.error, sqlite3, signal, resource, base64, socket, threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
s=json.loads(sys.argv[1]);source=Path(sys.argv[2]);root=Path(__file__).resolve().parents[1]
work=Path(tempfile.mkdtemp(prefix='micro-',dir='/private/tmp'));os.chdir(work)
results=[];process=None;log=work/'app.log';db=work/'inventory.sqlite';started=time.monotonic();sandbox_error=None;expected_products=None;expected_reservations=None;monitor_stop=threading.Event();resource_error=[]
with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
venv=Path(sys.prefix).resolve()
rules=['(version 1)','(allow default)']
# Deny user/private data while retaining installed OS runtime reads.
for path in ['/Users','/Volumes','/opt','/usr/local','/private/tmp','/private/var/folders','/private/var/root','/Library/Keychains','/private/etc/ssh']:
    rules.append('(deny file-read-data (require-all (subpath %s) (require-not (subpath %s)) (require-not (subpath %s))))'%(json.dumps(path),json.dumps(str(venv)),json.dumps(str(work))))
rules+=['(deny file-write* (require-all (require-not (subpath '+json.dumps(str(work))+')) (require-not (literal "/dev/null"))))','(deny network*)','(allow network-inbound (local ip "localhost:%d"))'%port,'(allow network-bind (local ip "localhost:%d"))'%port]
profile=work/'sandbox.sb';profile.write_text('\n'.join(rules))
cleanenv={'PATH':'/usr/bin:/bin','HOME':str(work),'PYTHONUNBUFFERED':'1','PYTHONDONTWRITEBYTECODE':'1','PORT':str(port),'DATABASE_PATH':str(db)}
if os.environ.get('FIXTURE_MODE')=='1':cleanenv.update(SCENARIO_MAX_NAME=str(s['max_name']),SCENARIO_MAX_STOCK=str(s['max_stock']),SCENARIO_MAX_QUANTITY=str(s['max_quantity']),SCENARIO_DESC=str(int(s['descending'])),SCENARIO_FILTER=str(int(s['filter'])))
def command(args):return ['/usr/bin/sandbox-exec','-f',str(profile),sys.executable]+args

def limits():
    os.setsid()
    resource.setrlimit(resource.RLIMIT_CPU,(12,12))
    resource.setrlimit(resource.RLIMIT_FSIZE,(2*1024*1024,2*1024*1024))
    resource.setrlimit(resource.RLIMIT_NOFILE,(96,96))
    # Darwin RLIMIT_AS is not a reliable RSS limit. This limitation is reported.

def monitor():
    while not monitor_stop.wait(.2):
        p=process
        if p is None:continue
        try:
            snapshot=subprocess.run(['/bin/ps','-axo','pgid=,rss='],capture_output=True,text=True,timeout=1)
            rows=[line.split() for line in snapshot.stdout.splitlines()]
            sizes=[int(row[1]) for row in rows if len(row)==2 and row[0]==str(p.pid)]
            if sum(sizes)>262144 or len(sizes)>8:
                resource_error.append('RSS >256MiB or process group >8 processes');os.killpg(p.pid,signal.SIGKILL)
        except (ProcessLookupError,ValueError,subprocess.TimeoutExpired):pass
threading.Thread(target=monitor,daemon=True).start()

def stop():
    global process
    if process:
        try:os.killpg(process.pid,signal.SIGKILL)
        except ProcessLookupError:pass
        process.wait(timeout=2);process=None

def req(method,path,data=None,raw=None):
    body=raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
    r=urllib.request.Request('http://127.0.0.1:'+str(port)+path,data=body,method=method,headers={'Content-Type':'application/json'})
    try:res=urllib.request.urlopen(r,timeout=3)
    except urllib.error.HTTPError as e:res=e
    with res:
        b=res.read(65537)
        if len(b)>65536:raise AssertionError('oversized HTTP response')
        try:value=json.loads(b) if b else None
        except Exception:value=b.decode(errors='replace')
        return res.status,value

def start():
    global process
    # Recreate trusted policy before each start; sandboxed app can only alter its temp directory.
    profile.write_text('\n'.join(rules))
    with log.open('ab') as f:process=subprocess.Popen(command(['app.py']),stdout=f,stderr=f,env=cleanenv,preexec_fn=limits)
    for _ in range(60):
        if process.poll() is not None:raise RuntimeError('application exited '+str(process.returncode))
        try:req('GET','/products');return
        except Exception:time.sleep(.05)
    raise TimeoutError('server startup timeout')

def check(name,fn):
    try:
        if time.monotonic()-started>28:raise TimeoutError('test deadline')
        fn();results.append({'name':name,'pass':True})
    except Exception as e:results.append({'name':name,'pass':False,'error':str(e)[:1500],'type':type(e).__name__})

def eq(actual,expected):
    if actual!=expected:raise AssertionError('expected '+repr(expected)+'; got '+repr(actual))

def status(method,path,data,expected,raw=None):
    code,value=req(method,path,data,raw);eq(code,expected)
    if expected>=400 and not isinstance(value,dict):raise AssertionError('error body must be JSON object')
    return value

def stock(pid):return status('GET','/products/'+str(pid),None,200)['stock']
def reserve(pid,qty,key,code=201):return status('POST','/reservations',dict(product_id=pid,quantity=qty,request_key=key),code)
def create(sku,stock_value=10,name='Widget'):
    return status('POST','/products',dict(sku=sku,name=name,stock=stock_value),201)

# Preflight uses a synthetic sentinel OUTSIDE allowed work. Its contents are never exposed.
sentinel_fd,sentinel_name=tempfile.mkstemp(prefix='micro-denied-',dir='/private/tmp');os.close(sentinel_fd);sentinel=Path(sentinel_name);sentinel.write_text('not-a-secret')
probe=r'''import socket,sys,os,flask,sqlite3,json
checks={}
for key,path in [('outside_read',sys.argv[1]),('source_read',sys.argv[2])]:
 try:open(path).read();checks[key]=False
 except PermissionError:checks[key]=True
try:open(sys.argv[1],'w');checks['outside_write']=False
except PermissionError:checks['outside_write']=True
for key,host,p in [('external_network','1.1.1.1',443),('other_loopback','127.0.0.1',9)]:
 sk=socket.socket();sk.settimeout(.5)
 try:sk.connect((host,p));checks[key]=False
 except PermissionError:checks[key]=True
 except Exception:checks[key]=False
 finally:sk.close()
sk=socket.socket();sk.bind(('127.0.0.1',int(sys.argv[3])));sk.listen();sk.close();checks['test_port_bind']=True
print(json.dumps(checks))
'''
try:
    if sys.platform!='darwin':raise RuntimeError('macOS Seatbelt required; no Docker or unsafe host fallback')
    r=subprocess.run(command(['-c',probe,str(sentinel),str(root/'src/contracts.ts'),str(port)]),capture_output=True,text=True,env=cleanenv,timeout=5,cwd=work)
    checks=json.loads(r.stdout)
    if r.returncode or not checks or not all(checks.values()):raise RuntimeError('sandbox calibration failed: '+json.dumps(checks))
except Exception as e:sandbox_error=str(e)
finally:sentinel.unlink(missing_ok=True)

if not sandbox_error:
    for name in ['app.py','db.py','schema.sql']:
        if (source/name).exists():shutil.copyfile(source/name,work/name)
    try:
        start()
        check('initial_products_empty',lambda:eq(req('GET','/products'),(200,[])))
        check('initial_reservations_empty',lambda:eq(req('GET','/reservations'),(200,[])))
        product=create('WIDGET',10,'  Widget  ');pid=product['id']
        check('product_shape',lambda:eq(product,dict(id=pid,sku='WIDGET',name='Widget',stock=10)))
        for i,v in enumerate([{},[],None,{'sku':'bad','name':'x','stock':1},{'sku':'X','name':' ','stock':1},{'sku':'X','name':'x'*(s['max_name']+1),'stock':1},{'sku':'X','name':'x','stock':True},{'sku':'X','name':'x','stock':-1},{'sku':'X','name':'x','stock':s['max_stock']+1},{'sku':'X','name':'x','stock':1.5},{'sku':'X','name':'x','stock':1,'extra':1}]):
            check('invalid_product_'+str(i),lambda v=v:status('POST','/products',v,400,raw=b'null' if v is None else None))
        check('duplicate_sku',lambda:status('POST','/products',dict(sku='WIDGET',name='dup',stock=1),409))
        check('malformed_json',lambda:status('POST','/reservations',None,400,raw=b'{broken'))
        check('missing_product',lambda:status('GET','/products/999999',None,404))
        def boundaries():
            p=create('BOUNDARY',s['max_stock'],'n'*s['max_name']);eq(p['stock'],s['max_stock']);eq(p['name'],'n'*s['max_name'])
            p=create('ZERO',0);reserve(p['id'],1,'zero-stock',409)
        check('product_boundaries',boundaries)
        for i,v in enumerate([{},[],{'product_id':pid,'quantity':0,'request_key':'b'},{'product_id':pid,'quantity':True,'request_key':'b'},{'product_id':pid,'quantity':s['max_quantity']+1,'request_key':'b'},{'product_id':True,'quantity':1,'request_key':'b'},{'product_id':pid,'quantity':1,'request_key':'bad key'},{'product_id':pid,'quantity':1,'request_key':''},{'product_id':pid,'quantity':1,'request_key':'x'*65},{'product_id':pid,'quantity':1,'request_key':'b','extra':1}]):
            check('invalid_reservation_'+str(i),lambda v=v:status('POST','/reservations',v,400))
        check('missing_product_reservation',lambda:reserve(999999,1,'missing',404))
        res=reserve(pid,3,'first');rid=res['id']
        check('reservation_shape',lambda:eq(res,dict(id=rid,product_id=pid,quantity=3,request_key='first',status='active')))
        check('stock_decrement',lambda:eq(stock(pid),7))
        def idem():
            eq(reserve(pid,3,'first',200),res);eq(stock(pid),7)
            reserve(pid,2,'first',409);eq(stock(pid),7)
            p=create('OTHER',5);reserve(p['id'],3,'first',409);eq(stock(p['id']),5)
        check('idempotency_and_conflict',idem)
        def rollback():
            before=req('GET','/reservations');reserve(pid,8,'too-many',409);eq(stock(pid),7);eq(req('GET','/reservations'),before)
        check('insufficient_stock_atomic',rollback)
        def cancel():
            v=status('POST','/reservations/'+str(rid)+'/cancel',{},200);eq(v,{**res,'status':'cancelled'});eq(stock(pid),10)
            eq(status('POST','/reservations/'+str(rid)+'/cancel',{},200),v);eq(stock(pid),10)
            eq(reserve(pid,3,'first',200),v);eq(stock(pid),10)
        check('cancel_once_and_replay',cancel)
        check('missing_cancel',lambda:status('POST','/reservations/999999/cancel',{},404))
        check('invalid_cancel',lambda:status('POST','/reservations/'+str(rid)+'/cancel',{'extra':1},400))
        def race():
            p=create('LAST',1);last=p['id']
            import threading
            barrier=threading.Barrier(2)
            def attempt(k):barrier.wait(timeout=2);return req('POST','/reservations',dict(product_id=last,quantity=1,request_key=k))
            with ThreadPoolExecutor(max_workers=2) as pool:replies=list(pool.map(attempt,['race-a','race-b']))
            eq(sorted(code for code,_ in replies),[201,409]);eq(stock(last),0)
            rows=req('GET','/reservations')[1];eq(len([r for r in rows if r['product_id']==last]),1)
        check('concurrent_last_unit',race)
        def concurrent_same_key():
            p=create('IDEM-RACE',5);other=p['id']
            import threading
            barrier=threading.Barrier(2)
            def attempt(_):barrier.wait(timeout=2);return req('POST','/reservations',dict(product_id=other,quantity=2,request_key='same-race'))
            with ThreadPoolExecutor(max_workers=2) as pool:replies=list(pool.map(attempt,[1,2]))
            eq(sorted(code for code,_ in replies),[200,201]);eq(replies[0][1],replies[1][1]);eq(stock(other),3)
        check('concurrent_idempotency',concurrent_same_key)
        def order():
            rows=req('GET','/products')[1];eq([r['id'] for r in rows],sorted([r['id'] for r in rows],reverse=s['descending']))
        check('product_order',order)
        if s['filter']:
            def filt():
                allrows=req('GET','/reservations')[1]
                for value in ['active','cancelled']:eq(req('GET','/reservations?status='+value),(200,[r for r in allrows if r['status']==value]))
                status('GET','/reservations?status=invalid',None,400)
            check('reservation_status_filter',filt)
        def persistence():
            before_p=req('GET','/products');before_r=req('GET','/reservations');stop();start()
            eq(req('GET','/products'),before_p);eq(req('GET','/reservations'),before_r)
            eq(reserve(pid,3,'first',200)['status'],'cancelled');eq(stock(pid),10)
            status('POST','/reservations/'+str(rid)+'/cancel',{},200);eq(stock(pid),10)
        check('restart_persistence_and_idempotency',persistence)
        expected_products=req('GET','/products')[1];expected_reservations=req('GET','/reservations')[1]
    except Exception as e:results.append({'name':'startup_or_required_setup','pass':False,'type':type(e).__name__,'error':str(e)})
    finally:stop()
    def integrity():
        if not db.exists():raise AssertionError('SQLite DATABASE_PATH file missing')
        with sqlite3.connect('file:'+str(db)+'?mode=ro',uri=True) as c:
            c.row_factory=sqlite3.Row
            eq(c.execute('PRAGMA integrity_check').fetchone()[0],'ok')
            eq(c.execute('PRAGMA foreign_key_check').fetchall(),[])
            foreign_keys=c.execute('PRAGMA foreign_key_list(reservations)').fetchall()
            if not any(r['table']=='products' and r['from']=='product_id' and r['to']=='id' for r in foreign_keys):raise AssertionError('reservations.product_id foreign key missing')
            if expected_products is not None:eq([dict(r) for r in c.execute('SELECT id,sku,name,stock FROM products ORDER BY id '+('DESC' if s['descending'] else 'ASC'))],expected_products)
            if expected_reservations is not None:eq([dict(r) for r in c.execute('SELECT id,product_id,quantity,request_key,status FROM reservations ORDER BY id')],expected_reservations)
    check('sqlite_integrity',integrity)
monitor_stop.set()
if resource_error:results.append({'name':'resource_limits','pass':False,'error':resource_error[0]})
output={'passed':not sandbox_error and bool(results) and all(x['pass'] for x in results),'evaluated':not bool(sandbox_error),'category':'sandbox_unavailable' if sandbox_error else None,'sandbox':{'engine':'macOS Seatbelt','calibrated':not bool(sandbox_error),'error':sandbox_error,'limits':'CPU 12s, wall timeout, 2MiB/file, 96 FDs; RSS 256MiB/process-group 8 monitored every 200ms (not kernel hard limits); installed system files readable'},'tests':results,'stdout_stderr':log.read_text(errors='replace')[-16000:] if log.exists() else '', 'exit_code':0 if not sandbox_error and all(x['pass'] for x in results) else 1,'elapsed_ms':round((time.monotonic()-started)*1000),'database_base64':base64.b64encode(db.read_bytes()).decode() if db.exists() and db.stat().st_size<2097152 else None}
print(json.dumps(output));shutil.rmtree(work,ignore_errors=True)
