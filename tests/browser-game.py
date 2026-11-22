# 1.40000.0 P3 game panel in real Chromium (390px). Run from www/: python3 -m http.server 8765 & python3 ../tests/browser-game.py
import json, os
from playwright.sync_api import sync_playwright
HERE=os.path.dirname(os.path.abspath(__file__))
SNAKE=open(os.path.join(HERE,'..','samples','snake.html'),encoding='utf-8').read()
EVIL='''<!doctype html><html><head><title>evil</title></head><body><canvas id=c></canvas><script>
var R={};window.__R=R;
function t(k,f){try{R[k]=f()}catch(e){R[k]='blocked:'+e.name}}
t('parentDoc',function(){return parent.document.title});
t('topLoc',function(){return top.location.href});
t('localStorage',function(){localStorage.setItem('a','1');return 'allowed'});
t('cookie',function(){return document.cookie===''?'empty-ok':'read'});
t('capacitor',function(){return typeof Capacitor+'/'+typeof S+'/'+typeof H+'/'+typeof NF});
t('open',function(){var w=window.open('https://example.com');return w?'opened':'null'});
var viol=0;document.addEventListener('securitypolicyviolation',function(){viol++});R.viol=function(){return viol};
fetch('/index.html').then(function(){R.fetchSame='allowed'},function(){R.fetchSame='blocked'});
fetch('http://localhost:8765/index.html').then(function(){R.fetchAbs='allowed'},function(){R.fetchAbs='blocked'});
var im=new Image();im.onload=function(){R.img='loaded'};im.onerror=function(){R.img='blocked'};im.src='http://localhost:8765/favicon.ico';
var x=new XMLHttpRequest();try{x.open('GET','http://localhost:8765/index.html');x.onerror=function(){R.xhr='blocked'};x.onload=function(){R.xhr='allowed'};x.send()}catch(e){R.xhr='blocked:'+e.name}
for(var i=0;i<50;i++)window.chaman.send('spam '+i);
window.__alive=1;
setTimeout(function(){location.href='about:blank'},1800);
</script></body></html>'''
FILES={'/sdcard/Chaman/ui/snake.html':SNAKE,'/sdcard/Chaman/ui/evil.html':EVIL}
def W(src,title): return {"role":"assistant","local":1,"content":"","aiNote":"w","ui":{"v":1,"id":"g-"+title.lower(),"blocks":[{"type":"html","src":src,"title":title,"height":460}]}}
def boot(p,theme,H):
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":390,"height":800},device_scale_factor=2,color_scheme=theme); pg=ctx.new_page()
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.add_init_script("try{localStorage.setItem('nap_first','1');localStorage.setItem('nap_ses',JSON.stringify({id:'S1',t0:1,title:'t'}));sessionStorage.setItem('nap_sid','S1');localStorage.setItem('nap_h',%s);localStorage.setItem('nap_s',%s)}catch(e){}"%(json.dumps(json.dumps(H)),json.dumps(json.dumps({"theme":theme,"rn":{"on":False,"warm":False,"net":[],"netInit":True},"lg":{"on":False}}))))
    pg.goto("http://localhost:8765/index.html"); pg.wait_for_timeout(500)
    pg.evaluate("(F)=>{window.uiReadText=async p=>{if(F[p])return F[p];throw new Error('nofile')};H.forEach(m=>uiFresh(m));render()}",FILES); pg.wait_for_timeout(150)
    return b,pg,errs
def game_frame(pg):
    for f in pg.frames:
        if f.url=='about:srcdoc': return f
    return None
res={}
with sync_playwright() as p:
    # ---- snake: open, sandbox attrs, survives re-render, bridge event, close/restart
    b,pg,errs=boot(p,"light",[{"role":"user","content":"snake khelao"},W('/sdcard/Chaman/ui/snake.html','Snake')])
    res['card']=pg.evaluate("[document.querySelectorAll('.uig').length,document.querySelectorAll('.uiw iframe').length,!!document.querySelector('#uigp')&&document.querySelector('#uigp').hidden!==false]")
    pg.click("[data-ua=play]"); pg.wait_for_timeout(700)
    res['panel']=pg.evaluate("(()=>{const p=document.querySelector('#uigp'),f=p&&p.querySelector('iframe');return {open:!!p&&!p.hidden,sandbox:f&&f.getAttribute('sandbox'),srcdoc:!!(f&&f.srcdoc),h:p&&Math.round(p.getBoundingClientRect().height),chatH:Math.round(document.querySelector('#chat').getBoundingClientRect().height),title:p.querySelector('.uigt').textContent}})()")
    fr=game_frame(pg); res['snake_canvas']=fr.evaluate("!!document.getElementById('cv')&&document.documentElement.dataset.theme") if fr else None
    pg.screenshot(path="/tmp/shots/game-light.png")
    pg.evaluate("window.__f=document.querySelector('#uigp iframe')"); fr.evaluate("window.__alive=1")
    fr.click('#go'); pg.wait_for_timeout(700)
    res['playing']=fr.evaluate("document.getElementById('ov').style.display")
    pg.evaluate("render()"); pg.wait_for_timeout(100)
    res['survivedRender']=pg.evaluate("document.querySelector('#uigp iframe')===window.__f")
    res['aliveAfterRender']=fr.evaluate("window.__alive")
    pg.screenshot(path="/tmp/shots/game-play.png")
    pg.wait_for_timeout(3200)  # snake hits the wall -> game over -> chaman.send
    res['sent']=pg.evaluate("H.filter(m=>m.role==='user').map(m=>m.content+'|'+(m.chip||''))")
    res['survived']=pg.evaluate("document.querySelector('#uigp iframe')===window.__f")
    res['alive']=fr.evaluate("window.__alive") if fr else None
    res['overlay']=fr.evaluate("document.getElementById('ov').style.display+'|'+document.getElementById('msg').textContent")
    res['chipDom']=pg.evaluate("[...document.querySelectorAll('.uichip')].map(e=>e.textContent)")
    pg.click("[data-ua=play]")  # second tap must not restart
    pg.wait_for_timeout(200); res['noRestart']=pg.evaluate("document.querySelector('#uigp iframe')===window.__f")
    pg.click("#uigp [data-g=re]"); pg.wait_for_timeout(500); res['restart']=pg.evaluate("document.querySelector('#uigp iframe')!==window.__f&&!!document.querySelector('#uigp iframe')")
    pg.click("#uigp [data-g=x]"); pg.wait_for_timeout(200); res['closed']=pg.evaluate("[document.querySelector('#uigp').hidden,document.querySelectorAll('#uigp iframe').length]")
    res['errs1']=errs; b.close()
    # ---- evil game: every escape probe, spam, navigation away
    b,pg,errs=boot(p,"light",[{"role":"user","content":"x"},W('/sdcard/Chaman/ui/evil.html','Evil')])
    pg.click("[data-ua=play]"); pg.wait_for_timeout(1000)
    fr=game_frame(pg); R=fr.evaluate("JSON.stringify(Object.assign({},window.__R,{viol:window.__R.viol()}))"); res['evil']=json.loads(R)
    res['evilSent']=pg.evaluate("H.filter(m=>m.role==='user'&&/game:/.test(m.content)).map(m=>m.content)")
    pg.wait_for_timeout(1800)
    res['nav']=pg.evaluate("[document.querySelectorAll('#uigp iframe').length,(document.querySelector('#uigp .uigm')||{}).textContent]")
    res['errs2']=errs
    # switch off closes the panel; a new game replaces the old one
    pg.click("#uigp [data-g=re]"); pg.wait_for_timeout(300)
    pg.evaluate("S.ui={off:true};render()"); pg.wait_for_timeout(200); res['offClose']=pg.evaluate("[document.querySelector('#uigp').hidden,document.querySelectorAll('#uigp iframe').length]")
    b.close()
    # ---- dark screenshot
    b,pg,errs=boot(p,"dark",[{"role":"user","content":"snake khelao"},W('/sdcard/Chaman/ui/snake.html','Snake')])
    pg.click("[data-ua=play]"); pg.wait_for_timeout(600); pg.screenshot(path="/tmp/shots/game-dark.png"); b.close()
print(json.dumps(res,indent=1,ensure_ascii=False))
