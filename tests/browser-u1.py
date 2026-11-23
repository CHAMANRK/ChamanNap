# U1 (1.42000.0) redesign check in real Chromium (390px, dark + light). Run from www/:
#   (python3 -m http.server 8765 >/dev/null 2>&1 & echo $! >/tmp/srv.pid; sleep 1; python3 ../tests/browser-u1.py; kill $(cat /tmp/srv.pid))
import json, sys, os
from playwright.sync_api import sync_playwright
os.makedirs('/tmp/shots', exist_ok=True)
CODE = "Ye lo ek chhota example:\n```js\nconst app = express();\napp.listen(3000);\n```\nAur ek list:\n- pehla\n- doosra"
H = [{"role":"user","content":"express server ka example do"},{"role":"assistant","by":"Groq","content":CODE},{"role":"user","content":"thanks"},{"role":"assistant","by":"Groq","content":"Koi baat nahi."}]
INIT = "localStorage.setItem('nap_first','1');localStorage.setItem('nap_ses',JSON.stringify({id:'S1',t0:1,title:'t'}));sessionStorage.setItem('nap_sid','S1');localStorage.setItem('nap_h',%s);"
fails = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
def run(theme):
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width":390,"height":800}, device_scale_factor=2, color_scheme=theme, has_touch=True); pg = ctx.new_page()
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.add_init_script(INIT % json.dumps(json.dumps(H)))
        pg.goto("http://localhost:8765/index.html"); pg.wait_for_timeout(700)
        t = theme
        # shell: no top bar, two floating buttons, hidden provider select
        ok(pg.evaluate("!document.querySelector('body>header')"), t+': no top bar')
        r = pg.evaluate("(()=>{const q=s=>{const r=document.querySelector(s).getBoundingClientRect();return [r.left,r.top,r.width,r.height]};return {m:q('#sesb'),n:q('#newb'),s:q('#send'),a:q('#att'),c:q('#provb')}})()")
        ok(r['m'][2]>=44 and r['m'][3]>=44 and r['n'][2]>=44 and r['n'][3]>=44, t+': floating buttons >=44px')
        ok(r['m'][0]<60 and r['n'][0]+r['n'][2]>340, t+': menu left, new chat right')
        ok(r['s'][3]>=44 and r['a'][3]>=44 and r['c'][3]>=44, t+': composer buttons >=44px')
        ok(pg.evaluate("getComputedStyle(document.querySelector('#prov')).display")=='none', t+': provider select hidden')
        ok(pg.evaluate("!document.documentElement.classList.contains('cw')"), t+': dots animation parked (no cw class)')
        pg.screenshot(path="/tmp/shots/u1-chat-%s.png" % t)
        # composer provider chip
        pg.click("#provb"); pg.wait_for_timeout(150)
        ok(pg.evaluate("!document.querySelector('#provpop').hidden && document.querySelectorAll('#provpop .pit').length>=4"), t+': provider list opens')
        pg.screenshot(path="/tmp/shots/u1-prov-%s.png" % t)
        pg.click("#provpop .pit:nth-child(3)"); pg.wait_for_timeout(100)
        ok(pg.evaluate("document.querySelector('#provpop').hidden && S.prov!=='auto' && document.querySelector('#provt').textContent.length>0"), t+': pick provider -> S.prov + chip text')
        pg.click("#provb"); pg.click("#provpop .pit:nth-child(1)"); pg.wait_for_timeout(100)
        ok(pg.evaluate("S.prov==='auto'"), t+': back to auto')
        # drawer
        pg.click("#sesb"); pg.wait_for_timeout(350)
        ok(pg.evaluate("document.querySelector('#sesw').classList.contains('open') && getComputedStyle(document.querySelector('#sesx')).opacity==='1'"), t+': drawer + scrim open')
        ok(pg.evaluate("(()=>{const d=document.querySelector('#sesw');return d.firstElementChild.id==='setb' && !!d.querySelector('#sesl')})()"), t+': drawer = Settings button first, sessions below')
        pg.screenshot(path="/tmp/shots/u1-drawer-%s.png" % t)
        pg.mouse.click(370, 400); pg.wait_for_timeout(350)
        ok(pg.evaluate("!document.querySelector('#sesw').classList.contains('open')"), t+': tap scrim closes drawer')
        # settings
        pg.click("#sesb"); pg.wait_for_timeout(250); pg.click("#setb"); pg.wait_for_timeout(350)
        ok(pg.evaluate("document.querySelector('#sheet').classList.contains('open') && !document.querySelector('#sesw').classList.contains('open')"), t+': Settings opens, drawer closes')
        n = pg.evaluate("document.querySelectorAll('#sbody .strow').length")
        ok(n>=10, t+': settings rows: %d' % n)
        ok(pg.evaluate("document.querySelectorAll('#sbody .grpc').length>=3 && document.querySelectorAll('#sbody h3.grp').length>=3"), t+': grouped cards with group labels')
        ok(pg.evaluate("[...document.querySelectorAll('#sbody .strow')].every(r=>r.getBoundingClientRect().height>=44)"), t+': rows >=44px')
        ok(pg.evaluate("getComputedStyle(document.querySelector('#sbody details.spg')).display")=='none', t+': old cards hidden on list view')
        pg.screenshot(path="/tmp/shots/u1-settings-%s.png" % t)
        # search
        pg.fill("#sq", "log"); pg.wait_for_timeout(150)
        vis = pg.evaluate("[...document.querySelectorAll('#sbody .strow')].filter(r=>!r.hidden).map(r=>r.querySelector('.stl').textContent)")
        ok(len(vis)>=1 and len(vis)<n and any('Log' in x for x in vis), t+': search "log" -> %s' % vis)
        pg.fill("#sq", "zzzzqq"); pg.wait_for_timeout(100)
        ok(pg.evaluate("!document.querySelector('#sqe').hidden"), t+': search no match message')
        pg.fill("#sq", ""); pg.wait_for_timeout(100)
        ok(pg.evaluate("document.querySelectorAll('#sbody .strow:not([hidden])').length")==n, t+': search cleared -> all rows')
        # sub-page
        pg.click("#sbody .strow:has-text('Theme')"); pg.wait_for_timeout(200)
        ok(pg.evaluate("document.querySelector('#sbody').classList.contains('pg') && document.querySelector('#sheet header h1').textContent==='Theme' && getComputedStyle(document.querySelector('#sbody details.spg.on')).display==='block'"), t+': row opens its own page, title = Theme')
        ok(pg.evaluate("getComputedStyle(document.querySelector('#sbody .grpc')).display==='none' && getComputedStyle(document.querySelector('#save')).display!=='none'"), t+': list hidden in page, Save still visible')
        pg.select_option("#th", "dark" if t=="light" else "light")
        pg.screenshot(path="/tmp/shots/u1-subpage-%s.png" % t)
        pg.click("#closeb"); pg.wait_for_timeout(150)
        ok(pg.evaluate("!document.querySelector('#sbody').classList.contains('pg') && document.querySelector('#sheet header h1').textContent==='Settings'"), t+': back returns to list')
        # animation row default off, provider row exists
        pg.click("#sbody .strow:has-text('Waiting animation')"); pg.wait_for_timeout(150)
        ok(pg.evaluate("document.querySelector('#an_on').value==='off'"), t+': waiting animation default Off')
        pg.click("#closeb")
        pg.click("#sbody .strow:has-text('Provider')"); pg.wait_for_timeout(150)
        pg.select_option("#prov_s", index=2); pg.click("#closeb")
        pg.click("#save"); pg.wait_for_timeout(300)
        ok(pg.evaluate("!document.querySelector('#sheet').classList.contains('open') && S.theme!=='auto' && S.prov!=='auto' && S.anim.on===false"), t+': Save stores theme + provider + anim=off, sheet closes')
        ok(pg.evaluate("document.documentElement.dataset.theme")==("dark" if t=="light" else "light"), t+': theme switched')
        ok(len(errs)==0, t+': 0 page errors %s' % errs[:2])
        b.close()
for th in ("dark","light"): run(th)
# empty chat shows plain word (animation parked)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width":390,"height":800}, device_scale_factor=2); pg = ctx.new_page()
    pg.add_init_script(INIT % json.dumps("[]")); pg.goto("http://localhost:8765/index.html"); pg.wait_for_timeout(600)
    ok(pg.evaluate("getComputedStyle(document.querySelector('.empty b')).color!=='rgba(0, 0, 0, 0)'"), 'empty chat: "Chaman" word visible (not transparent)')
    pg.screenshot(path="/tmp/shots/u1-empty.png"); b.close()
print("FAILED %d" % len(fails) if fails else "ALL PASS")
sys.exit(1 if fails else 0)
