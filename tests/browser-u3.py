# U3 (1.44000.0): diff viewer + review bar in real Chromium (390px, dark + light). Run from www/:
#   (python3 -m http.server 8765 >/dev/null 2>&1 & echo $! >/tmp/srv.pid; sleep 1; python3 ../tests/browser-u3.py; kill $(cat /tmp/srv.pid))
import json, sys, os
from playwright.sync_api import sync_playwright
os.makedirs('/tmp/shots', exist_ok=True)
OLD = "\n".join("line %02d of the old file with some text" % i for i in range(1, 41))
NEW = OLD.replace("line 05 of the old", "line 05 CHANGED of the new").replace("line 30 of the old file with some text", "line 30 of the old file with some text\nbrand new line")
LONGL = "const veryLongLine = '" + "x"*160 + "';"
H = [
 {"role":"user","content":"index.js badlo aur nayi file banao"},
 {"role":"assistant","by":"Groq","gx":1,"content":"Ho gaya.","steps":["File edit: a","File likhi: b","File likhi: c"],
  "cards":[
   {"n":"edit_file","k":"file","l":"File edit kar raha hu","g":"work/app/a.js","s":"ok","t":120,"r":"ho gaya","nt":["File edit: work/app/a.js (1 change)"],"i":0,"j":1,
    "df":[{"p":"work/app/a.js","k":"edit","a":1,"d":1,"om":0,"h":[{"h":"@@ -7,1 +7,1 @@","l":[["-",7,"<img src=x onerror=\"window.__x=1\">"],["+",7,"const ok = 1;"]]}]}]},
   {"n":"file_write","k":"file","l":"File likh raha hu","g":"work/app/b.js","s":"ok","t":80,"r":"ho gaya","nt":[],"i":1,"j":2,
    "df":[{"p":"work/app/b.js","k":"write","a":2,"d":1,"om":0,"h":[{"h":"@@ -3,5 +3,6 @@","l":[[" ",3,"keep a"],[" ",4,"keep b"],["-",5,"old line"],["+",5,"new line"],["+",6,LONGL],[" ",7,"keep c"]]}]}]},
   {"n":"file_write","k":"file","l":"File likh raha hu","g":"work/app/c.md","s":"ok","t":40,"r":"ho gaya","nt":[],"i":2,"j":3,
    "df":[{"p":"work/app/c.md","k":"new","a":3,"d":0,"om":0,"h":[{"h":"","l":[["+",1,"# Title"],["+",2,""],["+",3,"hello"]]}]}]}
  ]},
 {"role":"assistant","by":"Groq","content":"Sirf ek tool.","cards":[{"n":"file_read","k":"file","l":"File padh raha hu","g":"work/app/a.js","s":"ok","t":30,"r":"ho gaya","nt":[],"i":0,"j":0}],"steps":[]},
]
INIT = "try{if(window===window.top){localStorage.setItem('nap_first','1');localStorage.setItem('nap_ses',JSON.stringify({id:'S1',t0:1,title:'t'}));sessionStorage.setItem('nap_sid','S1');localStorage.setItem('nap_h',%s);}}catch(e){}"
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
        # card header summary
        ok(pg.evaluate("document.querySelectorAll('#chat .tch .dfsum').length==3"), t+': 3 cards show +/- summary in header (read-only card has none)')
        ok(pg.evaluate("document.querySelector('#chat .tch .dfsum').textContent")=='+1-1', t+': summary text +1-1')
        # review bar
        ok(pg.evaluate("document.querySelectorAll('#chat .rvb').length==1 && document.querySelector('#chat .rvb .rvt').textContent==='3 files badli'"), t+': review bar "3 files badli" only on the message with diffs')
        ok(pg.evaluate("document.querySelector('#chat .rvb .dfsum').textContent")=='+6-2', t+': review bar total +6-2')
        ok(pg.evaluate("document.querySelector('#chat .rvb').getBoundingClientRect().height>=44"), t+': review bar >=44px')
        pg.evaluate("document.querySelector('#chat .rvb').scrollIntoView({block:'center'})")
        pg.screenshot(path="/tmp/shots/u3-bar-%s.png" % t)
        # inline diff in the card
        ok(pg.evaluate("getComputedStyle(document.querySelector('#chat .tc .dfs-list')).display")=='flex' and pg.evaluate("document.querySelector('#chat .tc').classList.contains('open')")==False, t+': history cards stay collapsed')
        pg.click("#chat .tc:nth-child(2) .tch"); pg.wait_for_timeout(120)
        ok(pg.evaluate("(()=>{const c=document.querySelectorAll('#chat .tc')[1];return c.classList.contains('open')&&c.querySelectorAll('.dfl').length==6&&c.querySelectorAll('.dfl.a').length==2&&c.querySelectorAll('.dfl.d').length==1&&c.querySelector('.dfk').textContent==='@@ -3,5 +3,6 @@'})()"), t+': open card shows hunk header + rows (2 add, 1 del, 3 context)')
        ok(pg.evaluate("(()=>{const a=document.querySelector('#chat .tc:nth-child(2) .dfl.a .dft'),d=document.querySelector('#chat .tc:nth-child(2) .dfl.d .dft');return getComputedStyle(a.parentNode).backgroundColor!=='rgba(0, 0, 0, 0)'&&getComputedStyle(d.parentNode).backgroundColor!=='rgba(0, 0, 0, 0)'&&getComputedStyle(a.parentNode).backgroundColor!==getComputedStyle(d.parentNode).backgroundColor})()"), t+': add and delete rows have different tinted backgrounds')
        ok(pg.evaluate("[...document.querySelectorAll('#chat .tc:nth-child(2) .dfl')].map(e=>e.querySelector('.dfg').textContent).join('')")=='-++', t+': +/- glyphs shown (not colour only)')
        ok(pg.evaluate("[...document.querySelectorAll('#chat .dfl .dft')].every(e=>parseFloat(getComputedStyle(e).fontSize)>=12)"), t+': diff text >=12px')
        ok(pg.evaluate("(()=>{const r=document.querySelectorAll('#chat .tc')[1].querySelector('.dfr');return r.scrollWidth>r.clientWidth})()"), t+': long line scrolls sideways inside the diff (page does not)')
        ok(pg.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1 && document.getElementById('chat').scrollWidth<=document.getElementById('chat').clientWidth+1"), t+': no page-level horizontal scroll')
        pg.click("#chat .tc:nth-child(1) .tch"); pg.wait_for_timeout(100)
        ok(pg.evaluate("!window.__x && document.querySelectorAll('#chat .dft img').length===0 && document.querySelector('#chat .tc .dft').textContent.indexOf('<img')===0"), t+': diff text is escaped (shown as text)')
        pg.evaluate("document.querySelectorAll('#chat .tc')[1].scrollIntoView({block:'start'})")
        pg.screenshot(path="/tmp/shots/u3-inline-%s.png" % t)
        # full diff viewer
        pg.evaluate("document.querySelector('#chat .rvb').scrollIntoView({block:'center'})")
        pg.click("#chat .rvb"); pg.wait_for_timeout(250)
        ok(pg.evaluate("document.querySelector('#dfv').classList.contains('open') && document.querySelectorAll('#dfl .dfw').length==3"), t+': viewer opens with 3 file sections')
        ok(pg.evaluate("document.querySelector('#dfcnt').textContent")=='3 diffs', t+': count shown')
        ok(pg.evaluate("[...document.querySelectorAll('#dfl .dfw')].every(w=>w.classList.contains('open'))"), t+': <=3 files -> all expanded')
        ok(pg.evaluate("[...document.querySelectorAll('#dfv .dfsh, #dfv .ib')].every(b=>b.getBoundingClientRect().height>=44)"), t+': section headers + buttons >=44px')
        pg.screenshot(path="/tmp/shots/u3-viewer-%s.png" % t)
        pg.click("#dfl .dfw:nth-child(1) .dfsh"); pg.wait_for_timeout(100)
        ok(pg.evaluate("(()=>{const w=document.querySelector('#dfl .dfw');return !w.classList.contains('open')&&getComputedStyle(w.querySelector('.dfsb')).display==='none'&&w.querySelector('.dfsh').getAttribute('aria-expanded')==='false'})()"), t+': tap header collapses a file')
        pg.evaluate("window.__cp='';copyTxt=t=>{window.__cp=t;return Promise.resolve()}")
        pg.click("#dfvc"); pg.wait_for_timeout(120)
        ok(pg.evaluate("window.__cp.indexOf('--- work/app/a.js')===0 && window.__cp.indexOf('+const ok = 1;')>0 && window.__cp.indexOf('--- work/app/c.md (nayi file)')>0"), t+': copy gives unified diff text')
        pg.click("#dfvx"); pg.wait_for_timeout(100)
        ok(pg.evaluate("!document.querySelector('#dfv').classList.contains('open')"), t+': back closes viewer')
        # live: a running turn that edits a file -> diff visible while live
        pg.evaluate("""(()=>{busy=true;TURN={stop:false,steps:[]};const s=TURN.steps;
          const c=tcBegin(s,'edit_file',{path:'work/app/live.js'});
          tcDiff('edit_file',dfEdit('work/app/live.js',[{old:'let a = 1;\\nkeep',new:'let a = 2;\\nkeep'}],{lines:[4]}));
          tcEnd(c,s,'edit_file',{path:'work/app/live.js'},false,'x','File edit: live.js');
          lnBegin('File edit kar raha hu','run');lnDraw();})()""")
        pg.wait_for_timeout(250)
        ok(pg.evaluate("document.querySelectorAll('#ty .tc.ok.open .dff').length==1 && document.querySelectorAll('#ty .tc.open .dfl.a').length==1 && document.querySelector('#ty .dfn').textContent==='4'"), t+': live turn: finished edit card opens with its diff (line 4)')
        pg.screenshot(path="/tmp/shots/u3-live-%s.png" % t)
        pg.evaluate("lnEnd();busy=false;TURN=null")
        ok(len(errs)==0, t+': 0 page errors %s' % errs[:2])
        b.close()
for th in ("dark","light"): run(th)
print("FAILED %d" % len(fails) if fails else "ALL PASS")
sys.exit(1 if fails else 0)
