# 1.48000.0: card title (AI "why" line), full command on tap, 3+ cards collapse, free scroll + "Naya" button. Real Chromium, 390px, dark + light.
# Run from www/:
#   (python3 -m http.server 8765 >/dev/null 2>&1 & echo $! >/tmp/srv.pid; sleep 1; python3 ../tests/browser-u5.py; kill $(cat /tmp/srv.pid))
import json, os
from playwright.sync_api import sync_playwright
os.makedirs('/tmp/shots', exist_ok=True)
def card(n, k, l, w, g, s, fc="", r="ho gaya"):
    return {"n":n,"k":k,"l":l,"w":w,"g":g,"fc":fc,"s":s,"t":420,"r":r,"nt":[],"i":0,"j":0}
FULL = "cd /sdcard/Chaman/work/gsm && git status && git log --oneline -5"
H = [
 {"role":"user","content":"gsm repo dekho"},
 {"role":"assistant","by":"DeepSeek","content":"Ho gaya.","steps":[],"cards":[
   card("termux_run","term","Command chala raha hu","gsm folder me git status dekh raha hu","git status && git log --oneline -5","ok",FULL),
   card("file_read","file","File padh raha hu","README padh raha hu","/sdcard/Chaman/work/gsm/README.md","ok"),
   card("run_code","term","JavaScript chala raha hu","price nikaal raha hu","js: const r = await fetch(u)","ok","[js]\nconst r = await fetch(u);"),
   card("termux_run","term","Command chala raha hu","","ls","fail","ls /nope",r="fail"),
   card("open_url","web","Link khol raha hu","","example.com","ok")]},
 {"role":"user","content":"ek aur"},
 {"role":"assistant","by":"DeepSeek","content":"Do hi card.","steps":[],"cards":[
   card("file_list","file","Folder dekh raha hu","folder dekh raha hu","/sdcard/Chaman","ok"),
   card("file_read","file","File padh raha hu","","/sdcard/Chaman/a.txt","ok")]},
]
INIT = "try{if(window===window.top){localStorage.setItem('nap_first','1');localStorage.setItem('nap_ses',JSON.stringify({id:'S1',t0:1,title:'t'}));sessionStorage.setItem('nap_sid','S1');localStorage.setItem('nap_h',%s);}}catch(e){}"
fails = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
def run(theme):
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width":390,"height":800}, device_scale_factor=2, color_scheme=theme, has_touch=True); pg = ctx.new_page()
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
        pg.add_init_script(INIT % json.dumps(json.dumps(H)))
        pg.goto("http://localhost:8765/index.html"); pg.wait_for_timeout(700)
        t = theme
        # ---- history: 5 cards collapse, 2 cards do not
        ok(pg.evaluate("document.querySelectorAll('#chat .tcgrp').length")==1, t+': only the 5-card message is grouped (2 cards stay plain)')
        ok(pg.evaluate("document.querySelector('#chat .tcsum .tcsl').textContent")=='5 kaam · 4 ok · 1 fail', t+': summary text 5 kaam · 4 ok · 1 fail')
        ok(pg.evaluate("document.querySelector('#chat .tcsum').classList.contains('fail')"), t+': summary row is red when a card failed')
        ok(pg.evaluate("getComputedStyle(document.querySelector('#chat .tcgrp .tcfull')).display")=='none', t+': cards hidden while collapsed')
        ok(pg.evaluate("document.querySelector('#chat .tcsum').getBoundingClientRect().height>=44"), t+': summary row >=44px')
        pg.click("#chat .tcsum"); pg.wait_for_timeout(100)
        ok(pg.evaluate("getComputedStyle(document.querySelector('#chat .tcgrp .tcfull')).display")=='flex' and pg.evaluate("document.querySelector('#chat .tcsum').getAttribute('aria-expanded')")=='true', t+': tap opens the list')
        ok(pg.evaluate("H[1].gx")==1, t+': open state remembered on the message')
        ok(pg.evaluate("[...document.querySelectorAll('#chat .tcgrp .tcl')].map(x=>x.textContent)[0]")=='gsm folder me git status dekh raha hu', t+': title = AI why line')
        ok(pg.evaluate("[...document.querySelectorAll('#chat .tcgrp .tcl')].map(x=>x.textContent)[3]")=='Command chala raha hu', t+': no why -> app label fallback')
        ok(pg.evaluate("document.querySelector('#chat .tcgrp .tcg').textContent")=='git status && git log --oneline -5', t+': line under title = command without leading cd')
        ok(pg.evaluate("document.querySelectorAll('#chat .tcgrp .tcg')[2].textContent")=='js: const r = await fetch(u)', t+': code card shows lang + first line')
        pg.click("#chat .tcgrp .tc:nth-child(1) .tch"); pg.wait_for_timeout(100)
        ok(pg.evaluate("document.querySelector('#chat .tcgrp .tc .tcc').textContent")==FULL, t+': tap shows the FULL command')
        ok(pg.evaluate("[...document.querySelectorAll('#chat .tcc')].every(e=>parseFloat(getComputedStyle(e).fontSize)>=12)"), t+': command text >=12px')
        pg.screenshot(path="/tmp/shots/u5-hist-%s.png" % t)
        # ---- long title: one line + ellipsis by default, full text (wrapped) when the card is open
        LONG='gsm folder ke andar git status dekh raha hu aur phir pichle paanch commits ka log nikaal raha hu taaki pata chale kya badla'
        pg.evaluate("(l)=>{H[1].cards[0].w=l;H[1].cards[0].g=l;render()}", LONG)
        pg.wait_for_timeout(150)
        ok(pg.evaluate("(()=>{const e=document.querySelector('#chat .tcgrp .tc .tcl');return e.scrollWidth>e.clientWidth && getComputedStyle(e).whiteSpace==='nowrap' && e.textContent.length>100})()"), t+': long title stays one line with ... when closed (full text stored)')
        pg.click("#chat .tcgrp .tc:nth-child(1) .tch"); pg.wait_for_timeout(120)
        ok(pg.evaluate("(()=>{const e=document.querySelector('#chat .tcgrp .tc .tcl'),g=document.querySelector('#chat .tcgrp .tc .tcg');return e.textContent==%s && e.scrollWidth<=e.clientWidth && e.getBoundingClientRect().height>25 && g.getBoundingClientRect().height>20 && g.scrollWidth<=g.clientWidth})()" % json.dumps(LONG)), t+': open card shows full title + command line wrapped')
        pg.screenshot(path="/tmp/shots/u5-long-%s.png" % t)
        pg.evaluate("render()")
        # ---- tool list: why added to a COPY, required, original untouched
        ok(pg.evaluate("(()=>{const w=tcWhyTools(TOOLS);return w.length===TOOLS.length&&w.every(x=>x.function.parameters.properties.why&&x.function.parameters.required.indexOf('why')>=0)&&TOOLS.every(x=>!x.function.parameters.properties.why)})()"), t+': why added to every tool copy, original TOOLS untouched')
        # ---- execTool strips why, card gets it
        r = pg.evaluate("""(async()=>{
          const seen=[];const o=execTool0;
          window.execTool0=async(n,a,s,f)=>{seen.push(JSON.stringify(a));return 'ok'};
          const st=[];const res=await execTool('torch',{state:'on',why:'torch jala raha hu'},st);
          return {seen,c:st.cards&&st.cards[0]&&st.cards[0].w}})()""")
        ok(r["seen"]==['{"state":"on"}'] and r["c"]=='torch jala raha hu', t+': execTool removes why before the tool runs, card keeps it')
        # ---- live turn: collapsed, running card visible, expand survives redraw
        pg.evaluate("""(()=>{TURN={stop:false,steps:[]};busy=true;lnBegin('x','run');const s=TURN.steps;
          for(let i=0;i<3;i++){const c=tcBegin(s,'file_read',{path:'/sdcard/Chaman/f'+i+'.txt'},'padh raha hu '+i);tcEnd(c,s,'file_read',{},false,'x','');}
          tcBegin(s,'termux_run',{command:'cd /x && npm test'},'tests chala raha hu');lnDraw();})()""")
        pg.wait_for_timeout(150)
        ok(pg.evaluate("document.querySelector('#ty .tcgrp[data-live]')!==null"), t+': live group exists')
        ok(pg.evaluate("document.querySelector('#ty .tcsum .tcsl').textContent")=='4 kaam · 3 ho gaye · 1 chal raha', t+': live summary 4 kaam · 3 ho gaye · 1 chal raha')
        ok(pg.evaluate("getComputedStyle(document.querySelector('#ty .tcpeek')).display")!='none' and pg.evaluate("document.querySelector('#ty .tcpeek .tcl').textContent")=='tests chala raha hu', t+': running card stays visible under the summary')
        ok(pg.evaluate("getComputedStyle(document.querySelector('#ty .tcfull')).display")=='none', t+': finished cards hidden')
        pg.click("#ty .tcsum"); pg.wait_for_timeout(100)
        pg.evaluate("lnDraw()"); pg.wait_for_timeout(100)
        ok(pg.evaluate("LN.gx===true && getComputedStyle(document.querySelector('#ty .tcfull')).display")=='flex', t+': live expand survives a redraw')
        pg.screenshot(path="/tmp/shots/u5-live-%s.png" % t)
        pg.evaluate("lnEnd();busy=false;TURN=null;render()")
        # ---- free scroll
        many = [{"role":"user","content":"m%d" % i} if i%2==0 else {"role":"assistant","by":"x","content":"jawab %d\n\nlambi line " % i * 1 + "x "*80} for i in range(40)]
        pg.evaluate("H=%s;chJump();render()" % json.dumps(many)); pg.wait_for_timeout(200)
        ok(pg.evaluate("(()=>{const c=document.getElementById('chat');return c.scrollHeight-c.scrollTop-c.clientHeight<5})()"), t+': at bottom after render')
        ok(pg.evaluate("document.getElementById('chdn').hidden"), t+': Naya button hidden at bottom')
        pg.evaluate("(()=>{const c=document.getElementById('chat');c.scrollTop=200})()"); pg.wait_for_timeout(150)
        ok(pg.evaluate("chNear")==False, t+': scroll up -> chNear false')
        # new card arrives while user is scrolled up
        pg.evaluate("""(()=>{TURN={stop:false,steps:[]};busy=true;lnBegin('x','run');const s=TURN.steps;tcBegin(s,'termux_run',{command:'ls'},'ls');lnDraw();
          H.push({role:'assistant',by:'x',content:'naya jawab '+'y '.repeat(50)});render();})()""")
        pg.wait_for_timeout(200)
        ok(pg.evaluate("document.getElementById('chat').scrollTop")==200, t+': new content does NOT pull the view down (scrollTop stays 200)')
        ok(pg.evaluate("document.getElementById('chdn').hidden")==False, t+': Naya button appears')
        bb = pg.evaluate("(()=>{const r=document.getElementById('chdn').getBoundingClientRect(),f=document.getElementById('f').getBoundingClientRect();return [r.height,r.bottom<=f.top,r.right<=window.innerWidth]})()")
        ok(bb[0]>=36 and bb[1] and bb[2], t+': button sits above the input, inside the screen, >=36px high')
        pg.screenshot(path="/tmp/shots/u5-scroll-%s.png" % t)
        pg.click("#chdn"); pg.wait_for_timeout(200)
        ok(pg.evaluate("(()=>{const c=document.getElementById('chat');return c.scrollHeight-c.scrollTop-c.clientHeight<5})()") and pg.evaluate("document.getElementById('chdn').hidden"), t+': tap Naya -> bottom, button gone')
        pg.evaluate("H.push({role:'assistant',by:'x',content:'aur '+'z '.repeat(60)});render()"); pg.wait_for_timeout(150)
        ok(pg.evaluate("(()=>{const c=document.getElementById('chat');return c.scrollHeight-c.scrollTop-c.clientHeight<5})()"), t+': at bottom -> new content follows')
        pg.evaluate("lnEnd();busy=false;TURN=null")
        ok(not errs, t+': no JS errors ' + str(errs[:2]))
        b.close()
for th in ("dark", "light"): run(th)
print("\nFAILS:", len(fails))
for f in fails: print(" -", f)
raise SystemExit(1 if fails else 0)
