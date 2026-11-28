# 1.53000.0: Live voice mode ring (dots) in real Chromium, 390px, dark + light. The Waiting animation setting stays Off (parked).
# Run from www/:
#   (python3 -m http.server 8765 >/dev/null 2>&1 & echo $! >/tmp/srv.pid; sleep 1; python3 ../tests/browser-live.py; kill $(cat /tmp/srv.pid))
import json, os
from playwright.sync_api import sync_playwright
os.makedirs('/tmp/shots', exist_ok=True)
H = [{"role":"user","content":"aaj ka mausam batao"},{"role":"assistant","by":"DeepSeek","content":"Aaj halki dhoop hai, 28 degree."}]
INIT = "try{if(window===window.top){localStorage.setItem('nap_first','1');localStorage.setItem('nap_ses',JSON.stringify({id:'S1',t0:1,title:'t'}));sessionStorage.setItem('nap_sid','S1');localStorage.setItem('nap_h',%s);}}catch(e){}"
fails = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
# bounding box + dot count of the painted canvas pixels (canvas pixels in CSS px)
BOX = """(()=>{const cv=document.querySelector('.cwc');if(!cv||cv.style.display==='none')return null;
const g=cv.getContext('2d'),d=g.getImageData(0,0,cv.width,cv.height).data,w=cv.width,h=cv.height,dpr=cv.width/parseFloat(cv.style.width);
let x0=1e9,x1=-1,y0=1e9,y1=-1,n=0,mid=0;
for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){if(d[(y*w+x)*4+3]>40){n++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}}
const cx=(x0+x1)/2,cy=(y0+y1)/2,R=(x1-x0)/2;
for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){if(d[(y*w+x)*4+3]>40&&Math.hypot(x-cx,y-cy)<R*.5)mid++}
return{n:n,w:(x1-x0)/dpr,h:(y1-y0)/dpr,cx:cx/dpr,cy:cy/dpr,mid:mid,cw:parseFloat(cv.style.width),ch:parseFloat(cv.style.height)}})()"""
def run(theme):
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={"width":390,"height":800}, device_scale_factor=2, color_scheme=theme, has_touch=True); pg = ctx.new_page()
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
        pg.add_init_script(INIT % json.dumps(json.dumps(H)))
        pg.goto("http://localhost:8765/index.html"); pg.wait_for_timeout(700)
        t = theme
        ok(pg.evaluate("cwUser()")==False and pg.evaluate("document.querySelector('.cwc').style.display")!='block', t+': animation parked, nothing drawn before live')
        pg.evaluate("document.documentElement.setAttribute('data-x','1')")
        pg.evaluate("cwLive('listen')"); pg.wait_for_timeout(2200)
        ok(pg.evaluate("document.documentElement.classList.contains('vlive')") and pg.evaluate("document.documentElement.classList.contains('cw')"), t+': live: html has vlive + cw classes')
        ok(pg.evaluate("cwUser()")==False, t+': Settings switch still Off while live')
        bx = pg.evaluate(BOX)
        ok(bx is not None and bx['n']>300, t+': dots are drawn ('+str(bx and bx['n'])+' samples)')
        ok(bx is not None and abs(bx['w']-bx['h'])<12 and bx['w']>100, t+': round (w %.0f x h %.0f px)' % (bx['w'], bx['h']))
        ok(bx is not None and abs(bx['cx']-bx['cw']/2)<10 and abs(bx['cy']-bx['ch']*.45)<14, t+': sits in the middle of the chat area (cx %.0f cy %.0f of %.0f x %.0f)' % (bx['cx'],bx['cy'],bx['cw'],bx['ch']))
        ok(bx is not None and bx['mid']>bx['n']*.15, t+': filled disc, dots in the centre too (%s of %s)' % (bx['mid'], bx['n']))
        ok(pg.evaluate("parseFloat(getComputedStyle(document.getElementById('chat')).opacity)")<0.6, t+': chat text is dimmed behind the ring')
        pg.screenshot(path="/tmp/shots/live-listen-%s.png" % t)
        # beat while the AI works: the ring size changes visibly
        pg.evaluate("cwLive('think')")
        ws=[]
        for i in range(30):
            pg.wait_for_timeout(50); r=pg.evaluate(BOX); ws.append(r['w'] if r else 0)
        ok(max(ws)/max(1,min(ws))>1.08, t+': think: ring beats (width %.0f..%.0f px)' % (min(ws), max(ws)))
        pg.screenshot(path="/tmp/shots/live-think-%s.png" % t)
        pg.evaluate("cwLive('speak')"); pg.wait_for_timeout(600)
        ok(pg.evaluate(BOX) is not None, t+': speak: still drawn')
        # a normal AI wait while live: ring stays, no roaming dots
        pg.evaluate("setBusy(true);lnBegin('x','wait');lnDraw()"); pg.wait_for_timeout(700)
        ok(pg.evaluate("CW.mode")=='live' and pg.evaluate("document.querySelectorAll('#ty .cwx').length")==0, t+': AI wait while live: ring stays (mode live), no extra status-row dots')
        pg.evaluate("lnEnd();setBusy(false);render()")
        # live ends: fades out and everything is parked again
        pg.evaluate("cwLive('')"); pg.wait_for_timeout(1800)
        ok(pg.evaluate("CW.mode")=='off' and not pg.evaluate("document.documentElement.classList.contains('vlive')"), t+': live off: ring gone, vlive removed')
        ok(pg.evaluate("document.querySelector('.cwc').style.display")=='none' and not pg.evaluate("document.documentElement.classList.contains('cw')"), t+': parked again (canvas hidden, cw class removed)')
        ok(abs(pg.evaluate("parseFloat(getComputedStyle(document.getElementById('chat')).opacity)")-1)<0.01, t+': chat back to full opacity')
        # second live session works again
        pg.evaluate("cwLive('listen')"); pg.wait_for_timeout(1800)
        ok(pg.evaluate(BOX) is not None, t+': second live session draws again')
        pg.evaluate("cwLive('')"); pg.wait_for_timeout(1500)
        # mic button looks live
        pg.evaluate("VC.live=true;vcSt('idle')")
        ok(pg.evaluate("document.getElementById('micb').classList.contains('live')") and pg.evaluate("getComputedStyle(document.getElementById('micb')).boxShadow")!='none', t+': mic button shows the live ring')
        pg.evaluate("VC.live=false;vcSt('idle')")
        ok(not errs, t+': no JS errors ' + str(errs[:2]))
        b.close()
for th in ("dark", "light"): run(th)
print("\nFAILS:", len(fails))
for f in fails: print(" -", f)
raise SystemExit(1 if fails else 0)
