# 1.41000.0 P4 in real Chromium (390px): diagram + pan/zoom, mermaid fence, badge, stat, inline html. Run from www/: python3 -m http.server 8765 & python3 ../tests/browser-p4.py
import json
from playwright.sync_api import sync_playwright
def W(blocks,id='w1'): return {"role":"assistant","local":1,"content":"","aiNote":"w","ui":{"v":1,"id":id,"blocks":blocks}}
FLOW=[{"type":"diagram","title":"Login flow","nodes":[{"id":"s","label":"Start","shape":"round"},{"id":"u","label":"Username aur password daalo"},{"id":"v","label":"Password sahi?","shape":"diamond"},{"id":"h","label":"Home screen"},{"id":"e","label":"Error dikhao","shape":"box"},{"id":"x","label":"3 baar galat","shape":"circle"}],
 "edges":[{"from":"s","to":"u"},{"from":"u","to":"v"},{"from":"v","to":"h","label":"haan"},{"from":"v","to":"e","label":"nahi"},{"from":"e","to":"u","label":"dobara","style":"dashed"},{"from":"e","to":"x","label":"limit"},{"from":"s","to":"h","style":"thick","arrow":False}]}]
MERMAID=[{"type":"diagram","format":"mermaid","title":"Deploy","code":"graph LR\n A[Code push] --> B{Tests pass?}\n B -->|yes| C[Build APK]\n B -->|no| D[Fix]\n D --> A\n C --> E((Release))"}]
BADGES=[{"type":"badge","items":[{"label":"Red","color":"red"},{"label":"Green","color":"green"},{"label":"Blue","color":"blue"},{"label":"Grey","color":"grey"},{"label":"Yellow","color":"yellow"},{"label":"Orange","color":"orange"},{"label":"Purple","color":"purple"},{"label":"Teal","color":"teal"}]},
 {"type":"text","md":"Suggestions (tap karo):"},{"type":"badge","items":[{"label":"Aur batao","color":"blue","action":{"type":"send","value":"aur batao"}},{"label":"Chhota karo","color":"green","action":{"type":"send","value":"chhota karo"}},{"label":"Copy","color":"grey","action":{"type":"copy","value":"abc"}}]},
 {"type":"stat","items":[{"k":"Status","v":"Chal raha hai","type":"status","color":"green"},{"k":"Priority","v":"High","type":"badge","color":"red"},{"k":"Disk","v":"72","type":"progress","max":100},{"k":"Users","v":"1,240","type":"number"}]}]
INLINE=[{"type":"html","title":"Tap counter","html":"<!doctype html><html><body style='margin:0;display:grid;place-items:center;height:100vh;font:20px system-ui'><button id=b style='padding:20px 30px;font-size:22px' onclick=\"n++;this.textContent='Taps: '+n;if(n==3)chaman.send('3 taps ho gaye')\">Taps: 0</button><script>var n=0;</script></body></html>","height":300}]
FENCE="Ye lo:\n```ui\n"+json.dumps({"v":1,"id":"fz","blocks":[{"type":"diagram","format":"mermaid","code":"graph TD\n A[Idea] --> B[Plan] --> C[Build]"}]})+"\n```\nAur galat:\n```ui\n"+json.dumps({"v":1,"id":"fy","blocks":[{"type":"diagram","format":"mermaid","code":"sequenceDiagram\nA->>B: hi"}]})+"\n```"
def boot(p,theme,H,fresh=True):
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":390,"height":800},device_scale_factor=2,color_scheme=theme); pg=ctx.new_page()
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.add_init_script("try{localStorage.setItem('nap_first','1');localStorage.setItem('nap_ses',JSON.stringify({id:'S1',t0:1,title:'t'}));sessionStorage.setItem('nap_sid','S1');localStorage.setItem('nap_h',%s);localStorage.setItem('nap_s',%s)}catch(e){}"%(json.dumps(json.dumps(H)),json.dumps(json.dumps({"theme":theme,"rn":{"on":False,"warm":False,"net":[],"netInit":True},"lg":{"on":False}}))))
    pg.goto("http://localhost:8765/index.html"); pg.wait_for_timeout(500)
    pg.evaluate("(f)=>{if(f)H.forEach(m=>uiFresh(m));render()}",fresh); pg.wait_for_timeout(200)
    return b,pg,errs
def vb(pg): return pg.evaluate("document.querySelector('.uds').getAttribute('viewBox').split(' ').map(Number)")
res={}
with sync_playwright() as p:
    for th in ("light","dark"):
        b,pg,errs=boot(p,th,[{"role":"user","content":"login ka flowchart"},W(FLOW)])
        res['flow-'+th]=pg.evaluate("[document.querySelectorAll('.udn').length,document.querySelectorAll('.ude').length,document.querySelectorAll('.udlb').length]")
        pg.screenshot(path="/tmp/shots/diagram-%s.png"%th)
        if th=="light":
            v0=vb(pg); res['vb0']=v0
            pg.click("[data-ua=dz][data-i='1']"); v1=vb(pg); pg.click("[data-ua=dz][data-i='1']"); v2=vb(pg)
            res['zoomIn']=[round(v0[2]),round(v1[2]),round(v2[2])]
            res['zmClass']=pg.evaluate("document.querySelector('.udg').classList.contains('zm')")
            # mouse drag pans when zoomed
            box=pg.locator('.uds').bounding_box(); cx,cy=box['x']+box['width']/2,box['y']+box['height']/2
            pg.mouse.move(cx,cy); pg.mouse.down(); pg.mouse.move(cx+60,cy+40,steps=5); pg.mouse.up(); v3=vb(pg)
            res['dragPan']=[round(v2[0]),round(v3[0]),round(v2[1]),round(v3[1])]
            # state survives a chat re-render
            pg.evaluate("render()"); pg.wait_for_timeout(100); res['viewKept']=vb(pg)==v3
            # ctrl+wheel zoom
            pg.keyboard.down('Control'); pg.mouse.move(cx,cy); pg.mouse.wheel(0,-200); pg.keyboard.up('Control'); pg.wait_for_timeout(100); v4=vb(pg); res['wheel']=[round(v3[2]),round(v4[2])]
            pg.click("[data-ua=dz][data-i='0']"); res['fit']=vb(pg)==v0
            # synthetic touch: one finger on an un-zoomed diagram must NOT pan; two fingers pinch-zoom
            pg.evaluate("""()=>{const c=document.querySelector('.udg'),r=c.getBoundingClientRect(),y=r.top+r.height/2,fire=(t,id,x,yy)=>c.dispatchEvent(new PointerEvent(t,{pointerId:id,pointerType:'touch',clientX:x,clientY:yy,bubbles:true,isPrimary:id===1}));
              fire('pointerdown',1,r.left+100,y);fire('pointermove',1,r.left+160,y+30);fire('pointerup',1,r.left+160,y+30);}""")
            res['touchNoPan']=vb(pg)==v0
            pg.evaluate("""()=>{const c=document.querySelector('.udg'),r=c.getBoundingClientRect(),y=r.top+r.height/2,fire=(t,id,x)=>c.dispatchEvent(new PointerEvent(t,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,bubbles:true,isPrimary:id===1}));
              fire('pointerdown',1,r.left+150);fire('pointerdown',2,r.left+200);fire('pointermove',2,r.left+300);fire('pointermove',1,r.left+100);fire('pointerup',1,r.left+100);fire('pointerup',2,r.left+300);}""")
            v5=vb(pg); res['pinch']=[round(v0[2]),round(v5[2])]
            pg.click("[data-ua=dz][data-i='2']"); pg.click("[data-ua=dz][data-i='0']")
        res['errs-'+th]=errs; b.close()
    b,pg,errs=boot(p,"light",[{"role":"user","content":"deploy flow"},W(MERMAID)]); pg.screenshot(path="/tmp/shots/mermaid-light.png")
    res['mermaid']=pg.evaluate("[document.querySelectorAll('.udn').length,document.querySelectorAll('.ude').length,document.querySelector('.uds').viewBox.baseVal.width>document.querySelector('.uds').viewBox.baseVal.height]"); b.close()
    b,pg,errs=boot(p,"light",[{"role":"user","content":"x"},{"role":"assistant","content":FENCE}])
    res['fence']=pg.evaluate("[document.querySelectorAll('.uiw .uds').length,document.querySelectorAll('pre').length,[...document.querySelectorAll('.uierr')].map(e=>e.textContent)]"); b.close()
    for th in ("light","dark"):
        b,pg,errs=boot(p,th,[{"role":"user","content":"badges"},W(BADGES)])
        pg.screenshot(path="/tmp/shots/badges-%s.png"%th)
        if th=="light":
            pg.click("text=Chhota karo"); pg.wait_for_timeout(400)
            res['badgeTap']=pg.evaluate("H.filter(m=>m.role==='user').map(m=>m.content)")
        res['errs-b-'+th]=errs; b.close()
    b,pg,errs=boot(p,"light",[{"role":"user","content":"demo"},W(INLINE)])
    pg.click("[data-ua=play]"); pg.wait_for_timeout(600)
    fr=[f for f in pg.frames if f.url=='about:srcdoc'][0]
    res['inline']=pg.evaluate("(()=>{const f=document.querySelector('#uigp iframe');return {sandbox:f.getAttribute('sandbox'),csp:f.srcdoc.indexOf(\"connect-src 'none'\")>0,title:document.querySelector('#uigt,.uigt').textContent,card:document.querySelector('.uig small').textContent}})()")
    for i in range(3): fr.click('#b'); pg.wait_for_timeout(120)
    pg.wait_for_timeout(500)
    res['inlineSent']=pg.evaluate("H.filter(m=>m.role==='user').map(m=>m.content+'|'+(m.chip||''))")
    res['errs-inline']=errs; b.close()
print(json.dumps(res,indent=1,ensure_ascii=False))
