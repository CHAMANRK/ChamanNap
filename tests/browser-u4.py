# U4 (1.45000.0): syntax colours, file-viewer line numbers and risk dock in real Chromium (390px, dark + light). Run from www/:
#   (python3 -m http.server 8765 >/dev/null 2>&1 & echo $! >/tmp/srv.pid; sleep 1; python3 ../tests/browser-u4.py; kill $(cat /tmp/srv.pid))
import json, sys, os
from playwright.sync_api import sync_playwright
os.makedirs('/tmp/shots', exist_ok=True)
JS = "const a = 1.5; // note\nfunction foo(x){ return 'hi' + x }\nconst s = '<img src=x onerror=\"window.__x=1\">';"
PY = "def run(n):\n    # c\n    return f\"{n}\" if n else None"
SH = "$ pkg install -y git && echo \"v=$HOME\" # done"
JSON = '{"name":"Chaman","n":3,"ok":true}'
CSS = "a.b{color:#2F6B41;margin:0 10px}"
HTML = '<div class="a" id=x>hi</div>'
TXT = "plain <b>text</b> no colours"
def fence(l, c): return "```%s\n%s\n```" % (l, c)
CHAT = "\n\n".join(fence(l, c) for l, c in [("js", JS), ("python", PY), ("sh", SH), ("json", JSON), ("css", CSS), ("html", HTML), ("txt", TXT)])
H = [
 {"role": "user", "content": "code dikha"},
 {"role": "assistant", "by": "Groq", "content": CHAT},
]
INIT = "try{if(window===window.top){localStorage.setItem('nap_first','1');localStorage.setItem('nap_ses',JSON.stringify({id:'S1',t0:1,title:'t'}));sessionStorage.setItem('nap_sid','S1');localStorage.setItem('nap_h',%s);}}catch(e){}"
CONTRAST = """(sel,bgsel)=>{
  const lum=c=>{const m=c.match(/[\\d.]+/g).map(Number);const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(m[0])+0.7152*f(m[1])+0.0722*f(m[2])};
  const fg=getComputedStyle(document.querySelector(sel)).color,bg=getComputedStyle(document.querySelector(bgsel)).backgroundColor;
  const a=lum(fg),b=lum(bg);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)}"""
fails = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
def run(theme):
    t = theme
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 390, "height": 800}, device_scale_factor=2, color_scheme=theme, has_touch=True); pg = ctx.new_page()
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.add_init_script(INIT % json.dumps(json.dumps(H)))
        pg.goto("http://localhost:8765/index.html"); pg.wait_for_timeout(700)
        # ---- chat code blocks
        ok(pg.evaluate("document.querySelectorAll('#chat .code').length")==7, t+': 7 code blocks rendered')
        ok(pg.evaluate("(()=>{const c=document.querySelectorAll('#chat .code code');return ['hk','hs','hn','hc','hf'].every(k=>c[0].querySelector('.'+k))})()"), t+': js block has keyword/string/number/comment/function spans')
        ok(pg.evaluate("[...document.querySelectorAll('#chat .code')].slice(0,6).every(c=>c.querySelector('code span'))"), t+': js, python, sh, json, css, html all coloured')
        ok(pg.evaluate("document.querySelectorAll('#chat .code')[6].querySelector('code span')===null"), t+': unknown lang (txt) stays plain')
        ok(pg.evaluate("(()=>{const c=document.querySelector('#chat .code code');const col=e=>getComputedStyle(e).color;return new Set([col(c.querySelector('.hk')),col(c.querySelector('.hs')),col(c.querySelector('.hn')),col(c.querySelector('.hc')),col(c.querySelector('.hf')),col(c)]).size===6})()"), t+': 5 token colours + base text colour are all different')
        ok(pg.evaluate("getComputedStyle(document.querySelector('#chat .code .hc')).fontStyle")=='italic', t+': comments italic')
        ok(pg.evaluate("document.querySelectorAll('#chat .code .gut').length")==0, t+': no line numbers in chat code blocks')
        for k in ('hk','hs','hf','hn','hc'):
            ratio = pg.evaluate("(%s)('#chat .code .%s','#chat .code')" % (CONTRAST, k))
            ok(ratio >= 4.5, t+': .%s contrast on code background %.1f:1 (>=4.5)' % (k, ratio))
        ok(pg.evaluate("!window.__x && document.querySelectorAll('#chat .code img').length===0"), t+': html inside a code string is shown as text')
        pg.evaluate("window.__cp='';copyTxt=t=>{window.__cp=t;return Promise.resolve()}")
        pg.click("#chat .code .cp"); pg.wait_for_timeout(100)
        ok(pg.evaluate("window.__cp")==JS, t+': copy gives the exact original code (no spans, no numbers)')
        ok(pg.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"), t+': no page-level horizontal scroll')
        pg.evaluate("document.querySelector('#chat .code').scrollIntoView({block:'start'})")
        pg.screenshot(path="/tmp/shots/u4-code-%s.png" % t)
        # ---- file viewer: line numbers + colours
        LONG = "const long = '" + "y" * 150 + "';"
        FILE = "\n".join(["// file", "function a(x){ return x + 1 }", LONG] + ["let v%d = %d;" % (i, i) for i in range(4, 41)]) + "\n"
        pg.evaluate("""(f)=>{VW={a:{path:'work/app/a.js',kind:'code',name:'a.js'},mode:'code',text:f,lines:f.split('\\n').length-1,bytes:f.length};document.getElementById('viewer').classList.add('open');drawViewer()}""", FILE)
        pg.wait_for_timeout(150)
        ok(pg.evaluate("document.querySelector('#viewer .hln .gut').textContent.split('\\n').length")==40, t+': viewer gutter has 40 numbers (trailing newline ignored)')
        ok(pg.evaluate("document.querySelector('#viewer .hln code .hk')!==null && document.querySelector('#viewer .hln code .hc')!==null"), t+': viewer code is coloured')
        ok(pg.evaluate("(()=>{const g=document.querySelector('#viewer .gut').getBoundingClientRect(),c=document.querySelector('#viewer .hln code').getBoundingClientRect();return Math.abs(g.height-c.height)<2 && Math.abs(g.top-c.top)<2})()"), t+': gutter lines up with code (same height, same top)')
        ok(pg.evaluate("(()=>{const l=document.querySelector('#viewer .hln');return l.scrollWidth>l.clientWidth})()"), t+': long line scrolls sideways inside the code block')
        pg.evaluate("document.querySelector('#viewer .hln').scrollLeft=150")
        ok(pg.evaluate("(()=>{const l=document.querySelector('#viewer .hln').getBoundingClientRect(),g=document.querySelector('#viewer .gut').getBoundingClientRect();return g.left>=l.left-1 && g.left<=l.left+14})()"), t+': gutter stays pinned at the left while scrolling sideways')
        ok(pg.evaluate("(()=>{const w=document.querySelector('#viewer .gut');return getComputedStyle(w).userSelect==='none'})()"), t+': gutter not selectable')
        ok(pg.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"), t+': viewer: no page-level horizontal scroll')
        pg.screenshot(path="/tmp/shots/u4-viewer-%s.png" % t)
        pg.click("#vcopy"); pg.wait_for_timeout(100)
        ok(pg.evaluate("window.__cp")==FILE, t+': viewer copy = raw file text (no numbers)')
        # big file: no colours (cap) but numbers still there
        BIG = "\n".join("let a%d = %d;" % (i, i) for i in range(900)) + "\n"
        pg.evaluate("""(f)=>{VW.text=f;VW.lines=900;drawViewer()}""", BIG)
        ok(pg.evaluate("document.querySelector('#viewer .hln code span')===null && document.querySelector('#viewer .gut').textContent.split('\\n').length===900"), t+': >800 lines: plain text, line numbers kept')
        pg.evaluate("""()=>{VW.a={path:'work/app/n.txt',kind:'code',name:'n.txt'};VW.text='hello <b>x</b>\\nworld\\n';VW.lines=2;drawViewer()}""")
        ok(pg.evaluate("document.querySelector('#viewer .hln code span')===null && document.querySelector('#viewer .hln code').textContent==='hello <b>x</b>\\nworld\\n' && document.querySelectorAll('#viewer .hln code b').length===0"), t+': .txt file: plain, escaped, numbered')
        pg.evaluate("document.getElementById('vback').click()")
        # ---- risk dock
        ok(pg.evaluate("getComputedStyle(document.getElementById('rdock')).display")=='none', t+': no pending confirm -> dock hidden')
        pg.evaluate("""()=>{TCONF['t1']=v=>{window.__r=v};H.push({role:'assistant',by:'Termux',local:1,content:'Termux command chalani hai:\\n```\\nrm -rf ~/old <b>x</b>\\n```\\nWajah: files delete',confirm:{type:'termux',id:'t1',opts:[{name:''}],state:'pending',lab:''}});render()}""")
        pg.wait_for_timeout(150)
        ok(pg.evaluate("(()=>{const d=document.getElementById('rdock'),f=document.getElementById('f');return !d.hidden && d.getBoundingClientRect().bottom<=f.getBoundingClientRect().top+1 && d.getBoundingClientRect().height>60})()"), t+': dock visible, sits above the composer')
        ok(pg.evaluate("document.querySelector('#rdock').classList.contains('hi') && /files delete/.test(document.querySelector('#rdock .rdr').textContent) && /Risk:/.test(document.querySelector('#rdock .rdr').textContent)"), t+': files delete -> high risk (red) with a clear risk line')
        ok(pg.evaluate("document.querySelector('#rdock .rdb').textContent==='rm -rf ~/old <b>x</b>' && document.querySelectorAll('#rdock .rdb b').length===0"), t+': command shown as text (escaped)')
        ok(pg.evaluate("[...document.querySelectorAll('#rdock button')].every(b=>b.getBoundingClientRect().height>=44)") and pg.evaluate("document.querySelectorAll('#rdock button').length")==2, t+': only 2 buttons (Cancel, Chalao), each >=44px')
        ok(pg.evaluate("(()=>{const a=document.querySelector('#chat .acts');return a.classList.contains('rdoff') && getComputedStyle(a.querySelector('.abtn')).display==='none' && /dock/.test(getComputedStyle(a,'::before').content)})()"), t+': chat card buttons hidden, note points to the dock')
        ok(pg.evaluate("(()=>{const c=document.getElementById('chat');return c.scrollHeight-c.scrollTop-c.clientHeight<4})()"), t+': chat stays scrolled to the bottom when the dock appears')
        ok(pg.evaluate("(()=>{const d=document.getElementById('rdock').getBoundingClientRect();return d.height<=800*0.42+2})()"), t+': dock <= 42% of the screen')
        ok(pg.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"), t+': dock: no page-level horizontal scroll')
        pg.screenshot(path="/tmp/shots/u4-dock-hi-%s.png" % t)
        # scroll the chat away: dock stays put
        pg.evaluate("document.getElementById('chat').scrollTop=0")
        ok(pg.evaluate("(()=>{const d=document.getElementById('rdock').getBoundingClientRect();return d.top>400 && d.bottom<=800})()"), t+': chat scrolled to top: dock still on screen')
        # Allow via dock -> real chat handler runs, termux promise resolves true
        pg.click("#rdock .rdy"); pg.wait_for_timeout(200)
        ok(pg.evaluate("window.__r")==True and pg.evaluate("H[H.length-1].confirm.state")=='done', t+': Chalao in dock -> chat handler ran (state done, command allowed)')
        ok(pg.evaluate("document.getElementById('rdock').hidden"), t+': dock gone after Allow')
        # Cancel
        pg.evaluate("""()=>{window.__r=null;TCONF['t2']=v=>{window.__r=v};H.push({role:'assistant',by:'Termux',local:1,content:'Termux command chalani hai:\\n```\\nls -la\\n```\\nWajah: heavy kaam',confirm:{type:'termux',id:'t2',opts:[{name:''}],state:'pending'}});render()}""")
        pg.wait_for_timeout(100)
        ok(pg.evaluate("!document.querySelector('#rdock').classList.contains('hi') && !document.getElementById('rdock').hidden"), t+': heavy kaam = amber (not red)')
        pg.screenshot(path="/tmp/shots/u4-dock-mid-%s.png" % t)
        pg.click("#rdock .rdn"); pg.wait_for_timeout(200)
        ok(pg.evaluate("window.__r")==False and pg.evaluate("H[H.length-1].confirm.state")=='cancelled' and pg.evaluate("document.getElementById('rdock').hidden"), t+': Cancel in dock -> cancelled, dock gone')
        # SMS with two contacts: one button per contact
        pg.evaluate("""()=>{H.push({role:'assistant',by:'Phone',local:1,content:'SMS bhejna hai - kisko?:\\nRahul (+9198)\\nRohan (+9197)\\n\\nkal milte hain',confirm:{type:'sms',text:'kal milte hain',opts:[{name:'Rahul',number:'+9198'},{name:'Rohan',number:'+9197'}],state:'pending'}});render()}""")
        pg.wait_for_timeout(100)
        ok(pg.evaluate("[...document.querySelectorAll('#rdock .rdy')].map(b=>b.textContent).join('|')")=='Bhejo: Rahul|Bhejo: Rohan' and 'kal milte hain' in pg.evaluate("document.querySelector('#rdock .rdb').textContent"), t+': sms: full text + a button per contact')
        ok(pg.evaluate("[...document.querySelectorAll('#rdock .rdy')].every(b=>b.getBoundingClientRect().width>300)"), t+': sms: contact buttons full width')
        pg.screenshot(path="/tmp/shots/u4-dock-sms-%s.png" % t)
        pg.click("#rdock .rdy >> nth=1"); pg.wait_for_timeout(300)
        ok(pg.evaluate("H[H.length-1].content.indexOf('SMS: Rohan')===0") and pg.evaluate("document.getElementById('rdock').hidden"), t+': tapping the 2nd contact picks Rohan, dock gone')
        # long body is scrollable, dock stays small
        pg.evaluate("""()=>{H.push({role:'assistant',by:'Termux',local:1,content:'Termux command chalani hai:\\n```\\n'+Array.from({length:60},(_, i)=>'echo line '+i).join('\\n')+'\\n```\\nWajah: heavy kaam',confirm:{type:'termux',id:'t3',opts:[{name:''}],state:'pending'}});render()}""")
        pg.wait_for_timeout(100)
        ok(pg.evaluate("(()=>{const b=document.querySelector('#rdock .rdb'),d=document.getElementById('rdock');return b.scrollHeight>b.clientHeight && d.getBoundingClientRect().height<=800*0.42+2})()"), t+': long command: body scrolls inside the dock, dock stays <=42%')
        # a bubble-style click on the (hidden) chat button still works
        pg.evaluate("window.__r=null;TCONF['t3']=v=>{window.__r=v}")
        pg.evaluate("document.querySelector('.abtn[data-m=\"'+(H.length-1)+'\"][data-o=\"0\"]').click()"); pg.wait_for_timeout(200)
        ok(pg.evaluate("window.__r")==True and pg.evaluate("document.getElementById('rdock').hidden"), t+': code click on the hidden chat button (floating bubble path) still works and clears the dock')
        ok(len(errs) == 0, t+': 0 page errors %s' % errs[:2])
        b.close()
for th in ("dark", "light"): run(th)
print("FAILED %d" % len(fails) if fails else "ALL PASS")
sys.exit(1 if fails else 0)
