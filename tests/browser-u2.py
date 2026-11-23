# U2 (1.43000.0): tool cards, terminal view, log viewer in real Chromium (390px, dark + light). Run from www/:
#   (python3 -m http.server 8765 >/dev/null 2>&1 & echo $! >/tmp/srv.pid; sleep 1; python3 ../tests/browser-u2.py; kill $(cat /tmp/srv.pid))
import json, sys, os
from playwright.sync_api import sync_playwright
os.makedirs('/tmp/shots', exist_ok=True)
LONG = "\n".join("file%02d.txt" % i for i in range(1, 31))
ERRT = "ls: cannot access '/sdcard/x': No such file or directory\n[stderr]\nwarning: something odd\nboom"
XSS = "<img src=x onerror=\"window.__x=1\"><script>window.__y=1</script>"
H = [
 {"role":"user","content":"files dekho aur code chalao"},
 {"role":"assistant","by":"Groq","content":"Ho gaya.","steps":["Termux: exit 0","File padh li: a.txt","Edit fail: nahi mila","Status line nahi dikhi: x"],
  "cards":[
   {"n":"termux_run","k":"term","l":"Command chala raha hu","g":"ls -la /sdcard/Chaman","s":"ok","t":420,"r":"ho gaya","nt":["Termux: exit 0"],"i":0,"j":1},
   {"n":"file_read","k":"file","l":"File padh raha hu","g":"/sdcard/Chaman/a.txt","s":"ok","t":35,"r":"ho gaya","nt":["File padh li: a.txt"],"i":1,"j":2},
   {"n":"edit_file","k":"file","l":"File edit kar raha hu","g":"/sdcard/Chaman/b.txt","s":"fail","t":1800,"r":"Edit fail","nt":["Edit fail: nahi mila"],"i":2,"j":3},
   {"n":"run_code","k":"term","l":"JavaScript chala raha hu","g":"js","s":"run","t":0,"r":"","nt":[],"i":3,"j":3}
  ]},
 {"role":"assistant","by":"Termux","local":1,"content":"```\n$ ls\n```","term":{"cmd":"ls /sdcard/Chaman","out":LONG,"code":0,"state":"ok"}},
 {"role":"assistant","by":"Termux","local":1,"content":"x","term":{"cmd":"ls /sdcard/x","out":ERRT,"code":2,"state":"fail"}},
 {"role":"assistant","by":"Termux","local":1,"content":"x","term":{"cmd":"echo hi","out":XSS,"code":0,"state":"ok"}},
 {"role":"assistant","by":"Code","local":1,"content":"x","term":{"lang":"js","code":"const a = 2 + 2;\nconsole.log(a);","out":"4","state":"ok"}},
 {"role":"assistant","by":"Groq","content":"purana message","steps":["Purani line 1","Purani line 2"]},
]
INIT = "try{if(window===window.top){localStorage.setItem('nap_first','1');localStorage.setItem('nap_ses',JSON.stringify({id:'S1',t0:1,title:'t'}));sessionStorage.setItem('nap_sid','S1');localStorage.setItem('nap_h',%s);}}catch(e){}"
fails = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
def run(theme):
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width":390,"height":800}, device_scale_factor=2, color_scheme=theme, has_touch=True); pg = ctx.new_page()
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)+" @ "+str(getattr(e,"stack","") )[:300]))
        pg.add_init_script(INIT % json.dumps(json.dumps(H)))
        pg.goto("http://localhost:8765/index.html"); pg.wait_for_timeout(700)
        t = theme
        # ---- tool cards (history)
        ok(pg.evaluate("document.querySelectorAll('#chat .tc').length")==4, t+': 4 tool cards rendered')
        ok(pg.evaluate("document.querySelectorAll('#chat .tc.ok').length==2 && document.querySelectorAll('#chat .tc.fail').length==2"), t+': ok/fail states (unfinished run card shows as fail in history)')
        ok(pg.evaluate("[...document.querySelectorAll('#chat .tch')].every(h=>h.getBoundingClientRect().height>=44)"), t+': card headers >=44px')
        ok(pg.evaluate("getComputedStyle(document.querySelector('#chat .tc .tcb')).display")=='none', t+': cards collapsed by default')
        ok(pg.evaluate("[...document.querySelectorAll('#chat .tcl,#chat .tcg,#chat .tce,#chat .tcn,#chat .tcr')].every(e=>parseFloat(getComputedStyle(e).fontSize)>=12)"), t+': card text >=12px')
        pg.click("#chat .tc:nth-child(1) .tch"); pg.wait_for_timeout(100)
        ok(pg.evaluate("(()=>{const c=document.querySelector('#chat .tc');return c.classList.contains('open')&&getComputedStyle(c.querySelector('.tcb')).display==='block'&&c.querySelector('.tch').getAttribute('aria-expanded')==='true'&&c.querySelector('.tcb').textContent.indexOf('Termux: exit 0')>=0})()"), t+': tap opens card, shows result + note')
        pg.click("#chat .tc:nth-child(1) .tch"); pg.wait_for_timeout(80)
        ok(pg.evaluate("!document.querySelector('#chat .tc').classList.contains('open')"), t+': tap again closes')
        ok(pg.evaluate("document.querySelector('#chat .tcs-list+.steps').textContent.indexOf('Status line nahi dikhi')>=0"), t+': step line without a card still shown')
        ok(pg.evaluate("document.querySelectorAll('#chat .steps').length==2"), t+': old message (no cards) keeps old steps block')
        # ---- terminal
        ok(pg.evaluate("document.querySelectorAll('#chat .trm').length==4"), t+': 4 terminal/code views')
        ok(pg.evaluate("[...document.querySelectorAll('#chat .trb')].map(x=>x.textContent).join('|')")=='exit 0|exit 2|exit 0|ok', t+': badges exit 0 | exit 2 | exit 0 | ok')
        ok(pg.evaluate("document.querySelector('#chat .trm .cmd').textContent==='ls /sdcard/Chaman' && document.querySelector('#chat .trm .pr').textContent==='$'"), t+': command line shown with $')
        ok(pg.evaluate("document.querySelectorAll('#chat .trm.fail .tro .le').length>=2 && document.querySelectorAll('#chat .trm.fail .tro .lw').length>=1"), t+': failed output: error + warn lines coloured')
        ok(pg.evaluate("document.querySelectorAll('#chat .trm.ok .tro .le').length==0"), t+': ok output is not coloured red')
        ok(pg.evaluate("document.querySelector('#chat .trm .trx')!==null && document.querySelector('#chat .trm .tro').getBoundingClientRect().height<=225"), t+': long output capped at ~220px with show-all button')
        pg.click("#chat .trm .trx"); pg.wait_for_timeout(100)
        ok(pg.evaluate("document.querySelector('#chat .trm').classList.contains('big') && document.querySelector('#chat .trm .trx').textContent==='Chhota karo'"), t+': show-all grows the view')
        ok(pg.evaluate("!window.__x && !window.__y && document.querySelectorAll('#chat .tro img, #chat .tro script').length===0 && document.body.innerHTML.indexOf('&lt;img src=x')>=0"), t+': output is escaped (no injected tags/scripts)')
        ok(pg.evaluate("document.querySelector('#chat .trcode')!==null && [...document.querySelectorAll('#chat .trt')].some(x=>x.textContent==='js')"), t+': run_code view shows code + output')
        ok(pg.evaluate("[...document.querySelectorAll('#chat .trc')].every(b=>b.getBoundingClientRect().width>=44&&b.getBoundingClientRect().height>=44)"), t+': copy buttons >=44px')
        pg.evaluate("window.__cp='';copyTxt=t=>{window.__cp=t;return Promise.resolve()}")
        pg.click("#chat .trc"); pg.wait_for_timeout(150)
        ok(pg.evaluate("window.__cp.indexOf('$ ls /sdcard/Chaman')===0 && window.__cp.indexOf('file30.txt')>0 && window.__cp.indexOf('[exit 0]')>0"), t+': copy gives command + output + exit')
        pg.evaluate("document.querySelectorAll('#chat .trm')[1].scrollIntoView()")
        pg.screenshot(path="/tmp/shots/u2-term-%s.png" % t)
        pg.evaluate("document.querySelector('#chat .tc').scrollIntoView()"); pg.wait_for_timeout(100)
        pg.click("#chat .tc:nth-child(3) .tch"); pg.wait_for_timeout(100)
        pg.screenshot(path="/tmp/shots/u2-cards-%s.png" % t)
        # ---- live turn: running card open in the status row, timer ticks
        pg.evaluate("""(()=>{busy=true;TURN={stop:false,steps:[]};const s=TURN.steps;s.push('Termux: exit 0');
          const c1=tcBegin(s,'file_list',{path:'/sdcard/Chaman'});tcEnd(c1,s,'file_list',{path:'/sdcard/Chaman'},false,'x','Termux: exit 0');
          tcBegin(s,'termux_run',{command:'find / -name "*.log"'});
          lnBegin('Command chala raha hu','run');lnDraw();})()""")
        pg.wait_for_timeout(300)
        ok(pg.evaluate("document.querySelectorAll('#ty .tc').length==2 && document.querySelectorAll('#ty .tc.run.open').length==1 && document.querySelectorAll('#ty .tc.ok').length==1"), t+': live row: finished card + running card (open)')
        v0 = pg.evaluate("document.querySelector('#ty .tcel').textContent"); pg.wait_for_timeout(2300)
        v1 = pg.evaluate("document.querySelector('#ty .tcel').textContent")
        ok(v0!=v1, t+': running timer ticks (%s -> %s)' % (v0, v1))
        ok(pg.evaluate("document.querySelector('#ty .tc.run .tcg').textContent.indexOf('find /')===0"), t+': running card shows its target')
        pg.evaluate("document.querySelector('#ty .tc.ok .tch').click()"); pg.wait_for_timeout(50)
        pg.evaluate("lnDraw()"); pg.wait_for_timeout(50)
        ok(pg.evaluate("document.querySelector('#ty .tc.ok').classList.contains('open')"), t+': opened live card stays open after redraw')
        pg.screenshot(path="/tmp/shots/u2-live-%s.png" % t)
        pg.evaluate("""(()=>{const s=TURN.steps,c=s.cards[1];tcEnd(c,s,'termux_run',{command:'x'},true,'x','Termux: exit 1');lnDraw()})()""")
        ok(pg.evaluate("document.querySelectorAll('#ty .tc.fail').length==1 && document.querySelectorAll('#ty .tc.run').length==0"), t+': card ends -> fail state')
        pg.evaluate("lnEnd();busy=false;TURN=null")
        # ---- log viewer
        pg.evaluate("""(()=>{S.lg={on:true};logAdd('chaman','(Groq) hello');logAdd('tool','file_write /sdcard/Chaman/a.txt (12 chars)');logAdd('tool FAIL','termux_run (details in termux entry)');
          logAdd('termux','$ ls /sdcard/x (exit 2)','ls: cannot access x: No such file\\nboom');logAdd('confirm','termux expired (cancel)');logAdd('tool','run_code js (20 chars)')})()""")
        pg.click("#sesb"); pg.wait_for_timeout(250); pg.click("#setb"); pg.wait_for_timeout(300)
        pg.click("#sbody .strow:has-text('Logs')"); pg.wait_for_timeout(150)
        ok(pg.evaluate("!!document.querySelector('#lgo')"), t+': Settings > Logs has the viewer button')
        pg.click("#lgo"); pg.wait_for_timeout(250)
        ok(pg.evaluate("document.querySelector('#lgv').classList.contains('open') && document.querySelectorAll('#lgl .lge').length>=6"), t+': log viewer opens with entries')
        ok(pg.evaluate("document.querySelector('#lgcnt').textContent.indexOf('/')>0"), t+': count shown')
        ok(pg.evaluate("[...document.querySelectorAll('#lgv .lgchip,#lgv .ib')].every(b=>b.getBoundingClientRect().height>=44)"), t+': filter chips + header buttons >=44px')
        pg.screenshot(path="/tmp/shots/u2-logs-%s.png" % t)
        pg.click("#lgv .lgchip[data-f=err]"); pg.wait_for_timeout(120)
        ok(pg.evaluate("[...document.querySelectorAll('#lgl .lge')].length>=2 && [...document.querySelectorAll('#lgl .lge')].every(e=>e.classList.contains('err'))"), t+': Error filter shows only errors')
        pg.click("#lgv .lgchip[data-f=warn]"); pg.wait_for_timeout(120)
        ok(pg.evaluate("[...document.querySelectorAll('#lgl .lge')].length>=1 && [...document.querySelectorAll('#lgl .lge')].every(e=>e.classList.contains('warn'))"), t+': Warn filter shows only warnings (expired/cancel)')
        pg.click("#lgv .lgchip[data-f=all]"); pg.fill("#lgq", "run_code"); pg.wait_for_timeout(120)
        ok(pg.evaluate("document.querySelectorAll('#lgl .lge').length==1"), t+': search narrows list')
        pg.fill("#lgq", "exit 2"); pg.wait_for_timeout(120)
        pg.click("#lgl .lge .lgr"); pg.wait_for_timeout(100)
        ok(pg.evaluate("document.querySelector('#lgl .lge').classList.contains('open') && getComputedStyle(document.querySelector('#lgl .lgc')).display==='block' && document.querySelector('#lgl .lgc').textContent.indexOf('boom')>=0"), t+': tap row expands its code detail')
        pg.fill("#lgq", ""); pg.wait_for_timeout(100)
        before = pg.evaluate("document.querySelectorAll('#lgl .lge').length")
        pg.evaluate("logAdd('tool','late entry')"); pg.wait_for_timeout(1300)
        ok(pg.evaluate("document.querySelectorAll('#lgl .lge').length")==before+1, t+': new log appears live while open')
        pg.evaluate("window.__cp='';")
        pg.click("#lgvc"); pg.wait_for_timeout(150)
        ok(pg.evaluate("window.__cp.indexOf('[tool] file_write')>0"), t+': copy gives visible logs as text')
        pg.click("#lgvx"); pg.wait_for_timeout(100)
        ok(pg.evaluate("!document.querySelector('#lgv').classList.contains('open') && document.querySelector('#sheet').classList.contains('open')"), t+': back returns to Settings')
        ok(len(errs)==0, t+': 0 page errors %s' % errs[:2])
        b.close()
for th in ("dark","light"): run(th)
print("FAILED %d" % len(fails) if fails else "ALL PASS")
sys.exit(1 if fails else 0)
