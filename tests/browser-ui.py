import json, sys
from playwright.sync_api import sync_playwright
QUIZ={"v":1,"id":"quiz-1","title":"Sawal 1 / 5","blocks":[{"type":"progress","value":1,"max":5,"label":"1 / 5"},{"type":"text","md":"**2 + 3** kitne hote hain?"},{"type":"choice","id":"q","mode":"single","options":[{"label":"4","value":"A"},{"label":"5","value":"B","desc":"sahi jawab shayad"},{"label":"6","value":"C"}]}]}
FORM={"v":1,"id":"reg","title":"Registration","blocks":[{"type":"form","id":"f","fields":[{"key":"naam","label":"Naam","type":"text","required":True,"placeholder":"Najeef"},{"key":"umar","label":"Umar","type":"number","min":1,"max":120},{"key":"shehar","label":"Shehar","type":"select","options":["Delhi","Mumbai","Lucknow"]},{"key":"chai","label":"Chai pasand hai","type":"switch"},{"key":"mood","label":"Mood","type":"slider","min":0,"max":10}],"submit":{"label":"Bhejo"}}]}
TABLE={"v":1,"id":"tbl","blocks":[{"type":"alert","style":"warn","title":"Dhyan","md":"Prices **sample** hain"},{"type":"table","sortable":True,"columns":[{"key":"n","label":"Phone"},{"key":"p","label":"Price","type":"number"},{"key":"r","label":"RAM"},{"key":"c","label":"Camera"},{"key":"b","label":"Battery"}],"rows":[{"n":"Oppo K13","p":"24999","r":"8 GB","c":"50 MP","b":"7000 mAh"},{"n":"Realme","p":"19999","r":"6 GB","c":"50 MP","b":"5000 mAh"},{"n":"Poco","p":"9999","r":"4 GB","c":"13 MP","b":"5000 mAh"}]},{"type":"keyvalue","rows":[{"k":"Best value","v":"Realme"},{"k":"Sabse sasta","v":"Poco"}]},{"type":"card","title":"Command","subtitle":"copy karke Termux me chalao","body":[{"type":"code","lang":"bash","code":"git add . && git commit -m 'x' && git push"}],"footer":[{"type":"buttons","items":[{"label":"Copy","style":"primary","action":{"type":"copy","value":"git push"}},{"label":"Hatao","style":"danger","action":{"type":"none"}},{"label":"Phir se","action":{"type":"send","value":"dobara","silent":True}}]}]},{"type":"divider"},{"type":"progress","value":70,"max":100,"label":"70%"}]}
BAD="Ye bhi try:\n```ui\n{\"v\":1,\"blocks\":[{\"type\":\"text\",\"md\":\"fence se aaya\"},{\"type\":\"buttons\",\"items\":[{\"label\":\"Haan\",\"style\":\"primary\",\"action\":{\"type\":\"send\",\"value\":\"haan\"}}]}]}\n```\nAur galat:\n```ui\n{\"v\":1,\"blocks\":[\n```"
def msg(u): return {"role":"assistant","local":1,"content":"","aiNote":"w","ui":u}
def run(theme, scenario, shot):
    with sync_playwright() as p:
        b=p.chromium.launch(); ctx=b.new_context(viewport={"width":390,"height":800},device_scale_factor=2,color_scheme=theme); pg=ctx.new_page()
        errs=[]; pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m: errs.append(m.text) if m.type=="error" else None)
        H=scenario()
        pg.add_init_script("localStorage.setItem('nap_first','1');localStorage.setItem('nap_ses',JSON.stringify({id:'S1',t0:1,title:'t'}));sessionStorage.setItem('nap_sid','S1');localStorage.setItem('nap_h',%s);localStorage.setItem('nap_s',%s)"%(json.dumps(json.dumps(H)),json.dumps(json.dumps({"rn":{"on":False,"warm":False,"net":[],"netInit":True},"lg":{"on":False},"theme":theme}))))
        pg.goto("http://localhost:8765/index.html"); pg.wait_for_timeout(700)
        return pg,b,errs
def shot(theme,name,H,after=None):
    with sync_playwright() as p:
        b=p.chromium.launch(); ctx=b.new_context(viewport={"width":390,"height":800},device_scale_factor=2,color_scheme=theme); pg=ctx.new_page()
        errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
        pg.add_init_script("localStorage.setItem('nap_first','1');localStorage.setItem('nap_ses',JSON.stringify({id:'S1',t0:1,title:'t'}));sessionStorage.setItem('nap_sid','S1');localStorage.setItem('nap_h',%s);localStorage.setItem('nap_s',%s)"%(json.dumps(json.dumps(H)),json.dumps(json.dumps({"rn":{"on":False,"warm":False,"net":[],"netInit":True},"lg":{"on":False},"theme":theme}))))
        pg.goto("http://localhost:8765/index.html"); pg.wait_for_timeout(600)
        res=after(pg) if after else None
        pg.screenshot(path="/tmp/shots/%s-%s.png"%(name,theme))
        b.close(); return errs,res
out={}
for th in ("light","dark"):
    H=[{"role":"user","content":"quiz lo"},msg(QUIZ)]
    e,_=shot(th,"quiz",H); out["quiz-"+th]=e
    H=[{"role":"user","content":"form do"},msg(FORM)]
    e,_=shot(th,"form",H); out["form-"+th]=e
    H=[{"role":"user","content":"phones compare"},msg(TABLE),{"role":"assistant","content":BAD}]
    e,_=shot(th,"table",H); out["table-"+th]=e
# interaction tests (light)
H=[{"role":"user","content":"quiz lo"},msg(QUIZ)]
def tap_opt(pg):
    pg.click(".uio:nth-child(2)"); pg.wait_for_timeout(500)
    users=pg.eval_on_selector_all(".msg.me","els=>els.map(e=>e.textContent)")
    frozen=pg.eval_on_selector_all(".uiw.frz","els=>els.length")
    return {"users":users,"frozen":frozen,"hist":pg.evaluate("H.map(m=>m.role+':'+(m.content||'(w)'))")}
e,r=shot("light","tap",H,tap_opt); print("TAP",json.dumps(r),e)
H=[{"role":"user","content":"form do"},msg(FORM)]
def form_flow(pg):
    pg.click("[data-ua=sub]"); pg.wait_for_timeout(200)
    err1=pg.inner_text(".uierr")
    pg.fill(".uiw input[type=text]","Najeef"); pg.fill(".uiw input[type=number]","30"); pg.select_option(".uiw select","Lucknow"); pg.check("input.uisw")
    pg.eval_on_selector("input[type=range]","e=>{e.value=7;e.dispatchEvent(new Event('input',{bubbles:true}))}")
    sv=pg.inner_text(".uisv")
    pg.click("[data-ua=sub]"); pg.wait_for_timeout(500)
    return {"err1":err1,"slider_label":sv,"hist":pg.evaluate("H.filter(m=>m.role==='user').map(m=>m.content)")}
e,r=shot("light","formflow",H,form_flow); print("FORM",json.dumps(r,ensure_ascii=False),e)
H=[{"role":"user","content":"table"},msg(TABLE)]
def table_flow(pg):
    first=lambda: pg.eval_on_selector_all("tbody tr td:nth-child(2)","e=>e.map(x=>x.textContent).join(',')")
    a=first(); pg.click("th.srt:nth-child(2)"); b=first(); pg.click("th.srt:nth-child(2)"); c=first()
    # scroll position kept (chat not jumped): sort must not scroll the chat
    pg.click("text=Phir se"); pg.wait_for_timeout(500)
    chip=pg.eval_on_selector_all(".uichip","e=>e.map(x=>x.textContent)")
    hist=pg.evaluate("H.filter(m=>m.role==='user').map(m=>m.content+'|'+(m.chip||''))")
    tw=pg.evaluate("(()=>{const t=document.querySelector('.tw');return [t.scrollWidth,t.clientWidth]})()")
    return {"sort":[a,b,c],"chip":chip,"hist":hist,"table_scroll":tw}
e,r=shot("light","tableflow",H,table_flow); print("TABLE",json.dumps(r,ensure_ascii=False),e)
print("PAGE ERRORS",json.dumps(out))
