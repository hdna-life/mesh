# TRUSTED RUNNER CALIBRATION ONLY. Never sent to any real model.
import os, re, sqlite3
from flask import Flask, request, jsonify
app=Flask(__name__);DB=os.environ['DATABASE_PATH']
MAX_NAME=int(os.environ.get('SCENARIO_MAX_NAME','80'));MAX_STOCK=int(os.environ.get('SCENARIO_MAX_STOCK','1000'));MAX_QTY=int(os.environ.get('SCENARIO_MAX_QUANTITY','100'))
DESC=os.environ.get('SCENARIO_DESC')=='1';FILTER=os.environ.get('SCENARIO_FILTER')=='1'
def connect():
    c=sqlite3.connect(DB,timeout=5);c.row_factory=sqlite3.Row;return c
with connect() as c:
    c.executescript('CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,sku TEXT UNIQUE NOT NULL,name TEXT NOT NULL,stock INTEGER NOT NULL CHECK(stock>=0)); CREATE TABLE IF NOT EXISTS reservations(id INTEGER PRIMARY KEY AUTOINCREMENT,product_id INTEGER NOT NULL REFERENCES products(id),quantity INTEGER NOT NULL,request_key TEXT UNIQUE NOT NULL,status TEXT NOT NULL);')
def error(code):return jsonify(error='request rejected'),code
def payload(keys):
    v=request.get_json(silent=True)
    return v if isinstance(v,dict) and set(v)==set(keys) else None
@app.route('/products',methods=['POST','GET'])
def products():
    with connect() as c:
        if request.method=='GET':return jsonify([dict(r) for r in c.execute('SELECT * FROM products ORDER BY id '+('DESC' if DESC else 'ASC'))])
        v=payload(['sku','name','stock'])
        if v is None or not isinstance(v['sku'],str) or not re.fullmatch(r'[A-Z0-9-]{1,16}',v['sku']) or not isinstance(v['name'],str) or not 1<=len(v['name'].strip())<=MAX_NAME or type(v['stock']) is not int or not 0<=v['stock']<=MAX_STOCK:return error(400)
        try:
            cur=c.execute('INSERT INTO products(sku,name,stock) VALUES(?,?,?)',(v['sku'],v['name'].strip(),v['stock']))
            return jsonify(dict(c.execute('SELECT * FROM products WHERE id=?',(cur.lastrowid,)).fetchone())),201
        except sqlite3.IntegrityError:return error(409)
@app.get('/products/<int:pid>')
def product(pid):
    with connect() as c:
        r=c.execute('SELECT * FROM products WHERE id=?',(pid,)).fetchone()
        return (jsonify(dict(r)),200) if r else error(404)
@app.route('/reservations',methods=['POST','GET'])
def reservations():
    with connect() as c:
        if request.method=='GET':
            query='SELECT * FROM reservations';args=[]
            if FILTER and 'status' in request.args:
                value=request.args['status']
                if value not in ['active','cancelled']:return error(400)
                query+=' WHERE status=?';args.append(value)
            return jsonify([dict(r) for r in c.execute(query+' ORDER BY id',args)])
        v=payload(['product_id','quantity','request_key'])
        if v is None or type(v['product_id']) is not int or v['product_id']<=0 or type(v['quantity']) is not int or not 1<=v['quantity']<=MAX_QTY or not isinstance(v['request_key'],str) or not re.fullmatch(r'[A-Za-z0-9-]{1,64}',v['request_key']):return error(400)
        c.execute('BEGIN IMMEDIATE')
        old=c.execute('SELECT * FROM reservations WHERE request_key=?',(v['request_key'],)).fetchone()
        if old:
            return (jsonify(dict(old)),200) if old['product_id']==v['product_id'] and old['quantity']==v['quantity'] else error(409)
        row=c.execute('SELECT * FROM products WHERE id=?',(v['product_id'],)).fetchone()
        if row is None:return error(404)
        if row['stock']<v['quantity']:return error(409)
        c.execute('UPDATE products SET stock=stock-? WHERE id=?',(v['quantity'],v['product_id']))
        cur=c.execute("INSERT INTO reservations(product_id,quantity,request_key,status) VALUES(?,?,?,'active')",(v['product_id'],v['quantity'],v['request_key']))
        return jsonify(dict(c.execute('SELECT * FROM reservations WHERE id=?',(cur.lastrowid,)).fetchone())),201
@app.post('/reservations/<int:rid>/cancel')
def cancel(rid):
    if payload([]) is None:return error(400)
    with connect() as c:
        c.execute('BEGIN IMMEDIATE')
        r=c.execute('SELECT * FROM reservations WHERE id=?',(rid,)).fetchone()
        if r is None:return error(404)
        if r['status']=='active':
            c.execute('UPDATE products SET stock=stock+? WHERE id=?',(r['quantity'],r['product_id']))
            c.execute("UPDATE reservations SET status='cancelled' WHERE id=?",(rid,))
        return jsonify(dict(c.execute('SELECT * FROM reservations WHERE id=?',(rid,)).fetchone()))
if __name__=='__main__':app.run(host='127.0.0.1',port=int(os.environ['PORT']),threaded=True,debug=False)
