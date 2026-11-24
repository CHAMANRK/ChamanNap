# 1.46000.0 P5 in real Chromium (390px, light + dark): tabs, collapse, stepper, overlay/menu bottom sheet, wizard, standalone controls, table select/paging/badges, text variants.
# Run from www/: python3 -m http.server 8765 & python3 ../tests/browser-p5.py
import json
from playwright.sync_api import sync_playwright
def W(blocks,id='w1'): return {"role":"assistant","local":1,"content":"","aiNote":"w","ui":{"v":1,"id":id,"blocks":blocks}}
SKILLS=[
 {"type":"text","variant":"heading","md":"Skills jo aage kaam aayengi"},
 {"type":"table","selectable":"multi","pageSize":3,"sortable":True,"columns":[{"key":"skill","label":"Skill"},{"key":"lvl","label":"Level","type":"number"},{"key":"rec","label":"Rec","type":"badge","colors":{"Highly recommended":"green","Recommended":"blue","Optional":"grey"}}],
  "rows":[{"skill":"Python","lvl":"9","rec":"Highly recommended"},{"skill":"SQL","lvl":"8","rec":"Highly recommended"},{"skill":"Git","lvl":"7","rec":"Recommended"},{"skill":"Docker","lvl":"5","rec":"Recommended"},{"skill":"Rust","lvl":"3","rec":"Optional"}],"submit":{"label":"Inka roadmap do"}}]
LAYOUT=[
 {"type":"tabs","tabs":[{"label":"Overview","body":[{"type":"text","md":"Overview body"},{"type":"stepper","current":1,"steps":[{"label":"Idea","desc":"Soch"},{"label":"Build"},{"label":"Test"},{"label":"Ship","status":"error"}]}]},{"label":"Details","body":[{"type":"collapse","items":[{"title":"Pehla","open":True,"body":[{"type":"keyvalue","rows":[{"k":"A","v":"1"}]}]},{"title":"Doosra","body":[{"type":"text","md":"Chhupa hua"}]}]}]}]},
 {"type":"overlay","label":"Poora detail","title":"Detail","style":"primary","body":[{"type":"text","md":"Sheet ke andar"},{"type":"form","fields":[{"key":"n","label":"Naam","required":True}],"submit":{"label":"Bhejo"}},{"type":"table","columns":[{"key":"a","label":"A"}],"rows":[{"a":"x"}]}]},
 {"type":"menu","label":"Aur options","title":"Options","items":[{"label":"Copy","action":{"type":"copy","value":"zz"}},{"label":"Bhej do","variant":"primary","action":{"type":"send","value":"menu se bheja"}}]}]
WIZ=[{"type":"form","steps":[{"title":"Naam","fields":[{"key":"naam","label":"Naam","required":True}]},{"title":"Umar","fields":[{"key":"umar","label":"Umar","type":"number","min":1,"max":120,"required":True}]},{"title":"Pasand","fields":[{"key":"chai","label":"Chai","type":"switch"},{"key":"city","label":"City","type":"select","options":["Delhi","Pune"]}]}],"submit":{"label":"Jama karo"}},
 {"type":"select","key":"theme","label":"Theme","options":["Light","Dark"]},{"type":"switch","key":"notif","label":"Notifications"},{"type":"slider","key":"vol","label":"Volume","min":0,"max":10,"value":4,"submit":{"label":"Set"}},{"type":"input","key":"q","label":"Sawaal","placeholder":"likho"}]
def boot(p,theme,H,fresh=True):
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":390,"height":800},device_scale_factor=2,color_scheme=theme); pg=ctx.new_page()
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.add_init_script("try{localStorage.setItem('nap_first','1');localStorage.setItem('nap_ses',JSON.stringify({id:'S1',t0:1,title:'t'}));sessionStorage.setItem('nap_sid','S1');localStorage.setItem('nap_h',%s);localStorage.setItem('nap_s',%s)}catch(e){}"%(json.dumps(json.dumps(H)),json.dumps(json.dumps({"theme":theme,"rn":{"on":False,"warm":False,"net":[],"netInit":True},"lg":{"on":False}}))))
    pg.goto("http://localhost:8765/index.html"); pg.wait_for_timeout(500)
    pg.evaluate("(f)=>{if(f)H.forEach(m=>uiFresh(m));render()}",fresh); pg.wait_for_timeout(200)
    return b,pg,errs
res={}
# capture what the widgets send instead of calling a provider
CAP="window.__sent=[];window.uiSendText=function(t,c){window.__sent.push(t);return true};0"
with sync_playwright() as p:
    for th in ("light","dark"):
        # ---- skills table (the "badge beside each title" use case)
        b,pg,errs=boot(p,th,[{"role":"user","content":"skills suggest kar"},W(SKILLS,'sk')]); pg.evaluate(CAP)
        res['tbl-'+th]=pg.evaluate("[document.querySelectorAll('.uibg').length,document.querySelectorAll('.uibg.green').length,document.querySelectorAll('.uirc').length,document.querySelector('.uipg span')&&document.querySelector('.uipg span').textContent,document.querySelector('.v-heading')?1:0]")
        pg.screenshot(path="/tmp/shots/p5-table-%s.png"%th)
        pg.click(".uirc >> nth=0"); pg.click(".uirc >> nth=2")
        res['tick-'+th]=pg.evaluate("[document.querySelectorAll('tr.on').length,document.querySelector('[data-ua=tsub]').disabled,document.querySelector('[data-ua=tsub]').textContent]")
        pg.click("[data-ua=pg][data-i='1']"); res['page2-'+th]=pg.evaluate("[document.querySelector('.uipg span').textContent,document.querySelectorAll('tbody tr').length]")
        pg.click("[data-ua=tsub]"); res['sent-'+th]=pg.evaluate("window.__sent")
        # overflow: the widget must not widen the page
        res['noHScroll-'+th]=pg.evaluate("document.documentElement.scrollWidth<=window.innerWidth+1")
        b.close()
        # ---- layout: tabs, stepper, collapse, sheet, menu
        b,pg,errs=boot(p,th,[{"role":"user","content":"x"},W(LAYOUT,'lay')]); pg.evaluate(CAP)
        pg.screenshot(path="/tmp/shots/p5-layout-%s.png"%th)
        res['stepper-'+th]=pg.evaluate("[document.querySelectorAll('.uistp li').length,document.querySelectorAll('.uistp li.done').length,document.querySelectorAll('.uistp li.active').length,document.querySelectorAll('.uistp li.error').length]")
        pg.click(".uitb >> nth=1"); res['tab2-'+th]=pg.evaluate("[document.querySelectorAll('.uiai').length,!!document.body.innerText.match('Overview body')]")
        pg.click(".uicoh >> nth=1"); res['collapse-'+th]=pg.evaluate("document.body.innerText.includes('Chhupa hua')")
        pg.screenshot(path="/tmp/shots/p5-tabs2-%s.png"%th)
        pg.click("[data-ua=ov] >> nth=0"); pg.wait_for_timeout(100)
        res['sheetOpen-'+th]=pg.evaluate("(()=>{const e=document.getElementById('uish');const r=document.querySelector('.uish').getBoundingClientRect();return [!e.hidden,Math.round(r.bottom)===window.innerHeight,r.height<window.innerHeight*0.85,document.querySelector('.uishb').innerText.includes('Sheet ke andar')]})()")
        pg.screenshot(path="/tmp/shots/p5-sheet-%s.png"%th)
        # a form inside the sheet works: required error, then send closes the sheet
        pg.click(".uishb [data-ua=sub]"); res['sheetErr-'+th]=pg.evaluate("document.querySelector('.uishb .uierr').textContent")
        pg.fill(".uishb input[data-uf]","Najeef"); pg.click(".uishb [data-ua=sub]"); pg.wait_for_timeout(100)
        res['sheetSend-'+th]=pg.evaluate("[window.__sent,document.getElementById('uish').hidden]")
        # re-render of the chat while the sheet is open keeps the sheet
        pg.evaluate("window.__sent=[]"); pg.click("[data-ua=ov] >> nth=1"); pg.evaluate("render()"); pg.wait_for_timeout(100)
        res['menuKeep-'+th]=pg.evaluate("[!document.getElementById('uish').hidden,document.querySelectorAll('.uimn .uib').length]")
        pg.screenshot(path="/tmp/shots/p5-menu-%s.png"%th)
        pg.click(".uimn .uib >> nth=1"); pg.wait_for_timeout(100)
        res['menuSend-'+th]=pg.evaluate("[window.__sent,document.getElementById('uish').hidden]")
        pg.click("[data-ua=ov] >> nth=1"); pg.click(".uisx",position={"x":10,"y":10}); res['scrimClose-'+th]=pg.evaluate("document.getElementById('uish').hidden")
        b.close()
        # ---- wizard + standalone controls
        b,pg,errs=boot(p,th,[{"role":"user","content":"x"},W(WIZ,'wz')]); pg.evaluate(CAP)
        pg.screenshot(path="/tmp/shots/p5-wizard-%s.png"%th)
        pg.click("[data-ua=wnext]"); res['wizErr-'+th]=pg.evaluate("[document.querySelector('.uierr').textContent,document.querySelector('.uiws span').textContent]")
        pg.fill("input[data-k=naam]","Najeef"); pg.click("[data-ua=wnext]")
        pg.fill("input[data-k=umar]","30"); pg.click("[data-ua=wnext]")
        res['wizLast-'+th]=pg.evaluate("[document.querySelector('.uiws span').textContent,document.querySelector('[data-ua=sub]').textContent]")
        pg.check("input[data-k=chai]"); pg.select_option("select[data-k=city]","Pune"); pg.click("form, .uif [data-ua=sub] >> nth=0")
        res['wizSent-'+th]=pg.evaluate("window.__sent")
        pg.evaluate("window.__sent=[]")
        pg.select_option("select[data-k=theme]","Dark"); pg.wait_for_timeout(100); res['autoSelect-'+th]=pg.evaluate("window.__sent")
        b.close()
        b,pg,errs=boot(p,th,[{"role":"user","content":"x"},W(WIZ[1:],'wz2')]); pg.evaluate(CAP)
        pg.check("input[data-k=notif]"); pg.wait_for_timeout(100); res['autoSwitch-'+th]=pg.evaluate("window.__sent")
        pg.fill("input[data-k=q]","hello"); pg.click("[data-ua=sub] >> nth=1"); res['input-'+th]=pg.evaluate("window.__sent")
        res['errs-'+th]=errs
        b.close()
print(json.dumps(res,indent=1))
