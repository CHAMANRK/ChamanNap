// step27 (1.35000.0): waiting animation v1. 1.36000.0 (v2): long waits also show small acts (3 texts + 3 shapes) and /anim previews them.
// Fine dots form the word "Chaman": in the middle of an empty chat, and in the status row (where the old dot was) while the AI works.
// On send the dots scatter over the CHAT AREA only, now and then regroup into "Chaman", and settle when the answer arrives.
// One canvas over #chat (pointer-events none). No native code. If canvas is missing or anything throws, the animation turns itself off
// and the old look stays. Pure maths (cwTplBuild, cwSpawn, cwStep, cwAdvance) has no DOM, so tests/sim-anim.js can run it in node.
const CW={on:false,dead:false,cv:null,g:null,mode:'off',P:[],tpl:null,W:0,H:0,dpr:1,raf:0,last:0,T:0,mt:0,al:0,col:'#6fb08f',anc:null,miss:0,rm:false,N:560,rdur:5,busy:false,tm:0,wt:0,nextAct:false,act:null,actTpl:null,cur:'word',ac:{},ctxt:'',lastAct:'',demo:0,did:0,force:''};
const CW_TIME={hold:.5,regroup:1.7,finHold:.45,finFade:.35,intro:1.3,roamMin:4.5,roamMax:6.5,act:2.6,demoMin:1.8,demoMax:2.4};
const cwR=(a,b)=>a+Math.random()*(b-a);
const cwRoamDur=()=>CW.demo?cwR(CW_TIME.demoMin,CW_TIME.demoMax):cwR(CW_TIME.roamMin,CW_TIME.roamMax);
// alphaAt(x,y) -> true where the word is inked, on a w*h raster. Returns N points in 0..1 plus the width/height ratio.
// even=true (acts): dots are spread evenly over the ink (no two closer than ~0.8 of the average gap), so thin letters stay readable.
function cwTplBuild(alphaAt,w,h,N,even){
  N=N||CW.N;const pts=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(alphaAt(x,y))pts.push([x/w,y/h]);
  if(!pts.length)return null;
  for(let i=pts.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=pts[i];pts[i]=pts[j];pts[j]=t}
  let out;
  if(even){
    const r2=Math.pow(Math.sqrt(pts.length/N)*.8,2);out=[];
    for(let i=0;i<pts.length&&out.length<N;i++){
      const q=pts[i];let free=true;
      for(let j=0;j<out.length;j++){const dx=(q[0]-out[j][0])*w,dy=(q[1]-out[j][1])*h;if(dx*dx+dy*dy<r2){free=false;break}}
      if(free)out.push(q);
    }
  }else out=pts.slice(0,N);
  while(out.length<N){const q=pts[Math.floor(Math.random()*pts.length)];out.push([Math.min(1,Math.max(0,q[0]+cwR(-.01,.01))),Math.min(1,Math.max(0,q[1]+cwR(-.02,.02)))])}
  return{pts:out,asp:w/h};
}
// browser only: draw "Chaman" once on a hidden canvas and read the inked pixels
function cwSample(text,face,even){
  text=text||'Chaman';
  const c=document.createElement('canvas'),H0=80;
  const g=c.getContext&&c.getContext('2d');if(!g)return null;
  const font=face||('700 '+H0+'px ui-serif,Georgia,serif');
  g.font=font;const tw=Math.ceil(g.measureText(text).width)+16;
  c.width=tw;c.height=Math.ceil(H0*1.4);
  g.font=font;g.textBaseline='alphabetic';g.fillStyle='#000';g.fillText(text,8,H0);
  const d=g.getImageData(0,0,c.width,c.height).data;
  let x0=1e9,x1=-1,y0=1e9,y1=-1;
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(d[(y*c.width+x)*4+3]>110){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
  if(x1<0)return null;
  const w=x1-x0+1,h=y1-y0+1;
  return cwTplBuild((x,y)=>d[((y+y0)*c.width+(x+x0))*4+3]>110,w,h,0,even);
}
// ---- acts (v2): small things the dots form during a long wait: 3 texts + 3 shapes. Names are what /anim takes. ----
function cwHeart(x,y){const X=x*1.3,Y=-y*1.3+.1,a=X*X+Y*Y-1;return a*a*a-X*X*Y*Y*Y<=0}
function cwRing(x,y){const r=Math.hypot(x,y);if(r<.68||r>1)return false;const a=Math.atan2(y,x);return !(a>-.55&&a<.55)} // ring with a gap, so the spin is visible
const CW_STAR=(()=>{const v=[];for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?.42:1;v.push([Math.cos(a)*r,Math.sin(a)*r])}return v})();
function cwStar(x,y){const v=CW_STAR;let c=false;for(let i=0,j=v.length-1;i<v.length;j=i++){if((v[i][1]>y)!==(v[j][1]>y)&&x<(v[j][0]-v[i][0])*(y-v[i][1])/(v[j][1]-v[i][1])+v[i][0])c=!c}return c}
// fx(t): scale + rotation of the target while the act is shown (t = seconds since the act started)
const CW_ACTS=[
  {n:'soch',k:'text',t:'soch raha hu',h:36},
  {n:'bas',k:'text',t:'bas aa gaya',h:36},
  {n:'counter',k:'count',h:64,al:['count']},
  {n:'heart',k:'shape',f:cwHeart,trim:1,h:84,al:['dil'],fx:t=>{const ph=(t*1.3)%1;const pu=ph<.14?Math.sin(ph/.14*Math.PI):(ph>.22&&ph<.34?.55*Math.sin((ph-.22)/.12*Math.PI):0);return{s:1+.13*pu,r:0}}},
  {n:'ring',k:'shape',f:cwRing,h:96,fx:t=>({s:1,r:t*3.4})},
  {n:'star',k:'shape',f:cwStar,h:96,al:['tara'],fx:t=>({s:1+.09*Math.sin(t*6),r:t*.9})}
];
function cwFindAct(q){q=String(q||'').trim().toLowerCase();if(!q)return null;return CW_ACTS.find(a=>a.n===q||(a.al||[]).indexOf(q)>=0)||CW_ACTS.find(a=>a.n.indexOf(q)===0)||null}
// browser only: text / shape templates (built once, then cached; the counter is rebuilt when its number changes)
function cwTextTpl(s){return cwSample(s,'700 80px ui-sans-serif,system-ui,sans-serif',true)}
function cwShapeTpl(a){
  const RS=120,f=(ix,iy)=>a.f((ix+.5)/RS*2-1,(iy+.5)/RS*2-1);
  let x0=0,y0=0,w=RS,h=RS;
  if(a.trim){let X0=1e9,X1=-1,Y0=1e9,Y1=-1;for(let y=0;y<RS;y++)for(let x=0;x<RS;x++)if(f(x,y)){if(x<X0)X0=x;if(x>X1)X1=x;if(y<Y0)Y0=y;if(y>Y1)Y1=y}if(X1<0)return null;x0=X0;y0=Y0;w=X1-X0+1;h=Y1-Y0+1}
  return cwTplBuild((x,y)=>f(x+x0,y+y0),w,h,0,true);
}
function cwActTpl(a){
  if(a.k==='count'){const s=Math.floor(CW.wt)+'s';const t=cwTextTpl(s);if(t)CW.ctxt=s;return t}
  if(CW.ac[a.n])return CW.ac[a.n];
  const t=a.k==='text'?cwTextTpl(a.t):cwShapeTpl(a);
  if(t)CW.ac[a.n]=t;
  return t;
}
function cwUseTpl(t,name){const P=CW.P,n=Math.min(P.length,t.pts.length);for(let i=0;i<n;i++){P[i].u=t.pts[i][0];P[i].v=t.pts[i][1]}CW.cur=name}
function cwPickAct(){
  if(CW.force)return CW_ACTS.find(a=>a.n===CW.force)||null;
  const pool=CW_ACTS.filter(a=>a.n!==CW.lastAct&&!a.dead);
  return pool.length?pool[Math.floor(Math.random()*pool.length)]:null;
}
function cwEnterAct(){
  try{
    const a=cwPickAct(),t=a&&cwActTpl(a);
    if(!t){if(a)a.dead=1;CW.nextAct=false;cwSet('regroup');return}
    CW.lastAct=a.n;CW.act=a;CW.actTpl=t;cwUseTpl(t,a.n);cwSet('act');
  }catch(e){CW.nextAct=false;cwSet('regroup')}
}
function cwCountTick(){
  const s=Math.floor(CW.wt)+'s';if(s===CW.ctxt)return;
  const t=cwTextTpl(s);if(!t)return;
  CW.ctxt=s;CW.actTpl=t;
  // new number: match dots to targets left to right by where they are now, so they flow instead of crossing the whole word
  const P=CW.P,n=Math.min(P.length,t.pts.length);
  const idx=P.map((p,i)=>i).sort((a,b)=>P[a].x-P[b].x||P[a].y-P[b].y);
  const q=t.pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  for(let k=0;k<n;k++){const p=P[idx[k]];p.u=q[k][0];p.v=q[k][1]}
  CW.cur='count';
}
// where the act is drawn: centre of the chat area, size from the act's height but kept inside the area
function cwActAnchor(){
  const a=CW.act,t=CW.actTpl;
  const h=a.k==='shape'?Math.min(a.h,CW.W*.45,CW.H*.45):Math.min(a.h,CW.W*.86/t.asp,CW.H*.5);
  return{x:CW.W/2,y:CW.H*.45,w:h*t.asp,h:h};
}
// /anim: demo mode. Short roams, acts come at once; with a name only that act repeats. The command keeps the turn busy, so the real waiting look runs.
function cwDemo(name){CW.demo=++CW.did;CW.force=name||'';return CW.demo}
function cwDemoEnd(id){if(!id||CW.demo===id){CW.demo=0;CW.force=''}}
function animList(){return CW_ACTS.map(a=>a.n).join(', ')}
async function animCmd(a){
  const q=String(a||'').trim().toLowerCase();
  const say=t=>H.push({role:'assistant',by:'App',info:1,content:t});
  if(q==='list'||q==='help'||q==='?'){say('/anim = random demo (40 sec), /anim <naam> = sirf wahi (15 sec). Stop dabane se ruk jata hai.\nNaam: '+animList()+' (dil = heart, tara = star).');return}
  let name='';
  if(q){const m=cwFindAct(q);if(!m){say('Ye animation nahi mila: '+q+'. Naam: '+animList()+'.');return}name=m.n}
  if(!cwOk()||CW.rm){say('Animation abhi band hai ('+(CW.rm?'reduced motion on hai':'canvas nahi chala')+'), isliye demo nahi dikha sakta.');return}
  const id=cwDemo(name);
  try{if(typeof lnSet==='function')lnSet('Animation demo'+(name?': '+name:''),'wait')}catch(e){}
  const ms=(name?15:40)*1000,t0=Date.now();
  const stopped=await new Promise(res=>{const iv=setInterval(()=>{
    if(!busy||CW.demo!==id){clearInterval(iv);res(true)}
    else if(Date.now()-t0>=ms){clearInterval(iv);res(false)}
  },250)});
  cwDemoEnd(id);
  if(!stopped)say('Animation demo khatam. /anim list se naam dekho.');
}
function cwPick(){return{x:cwR(10,Math.max(11,CW.W-10)),y:cwR(10,Math.max(11,CW.H-10))}}
// kind: 'rand' (start anywhere, then assemble) or 'formed' (start on the word)
function cwSpawn(kind,A){
  CW.cur='word';
  CW.P=CW.tpl.pts.map(q=>{
    const w=cwPick();
    const p={u:q[0],v:q[1],x:0,y:0,vx:0,vy:0,wx:w.x,wy:w.y,wt:cwR(0,3),sp:cwR(70,180),f:cwR(.6,2.2),ph:cwR(0,6.283),r:cwR(.7,1.1),d:cwR(0,.35)};
    if(kind==='formed'&&A){p.x=A.x+(p.u-.5)*A.w+cwR(-5,5);p.y=A.y+(p.v-.5)*A.h+cwR(-5,5)}
    else{p.x=cwR(0,CW.W);p.y=cwR(0,CW.H)}
    return p;
  });
}
// scatter: push every dot away from the word and give it a new waypoint
function cwBurst(A){
  for(const p of CW.P){
    let dx=p.x-A.x,dy=p.y-A.y;const d=Math.hypot(dx,dy)||1;
    const s=cwR(160,420);p.vx+=dx/d*s+cwR(-60,60);p.vy+=dy/d*s+cwR(-60,60);
    const w=cwPick();p.wx=w.x;p.wy=w.y;p.wt=cwR(1.5,4);
  }
}
// one physics step. form=true: spring to the word; form=false: roam over the area.
function cwStep(P,dt,form,A,T,tm){
  const W=CW.W,H=CW.H;
  let rc=1,rs=0,sc=1;if(A.rot){rc=Math.cos(A.rot);rs=Math.sin(A.rot)}if(A.s)sc=A.s; // acts can spin / pulse
  for(const p of P){
    if(form&&tm>=p.d){
      let ox=(p.u-.5)*A.w,oy=(p.v-.5)*A.h;if(rs){const nx=ox*rc-oy*rs;oy=ox*rs+oy*rc;ox=nx}
      const tx=A.x+ox*sc,ty=A.y+oy*sc;
      p.vx+=((tx-p.x)*46-p.vx*11)*dt;p.vy+=((ty-p.y)*46-p.vy*11)*dt;
      const sp=Math.hypot(p.vx,p.vy);if(sp>900){p.vx*=900/sp;p.vy*=900/sp}
    }else{
      let dx=p.wx-p.x,dy=p.wy-p.y;const d=Math.hypot(dx,dy)||1;
      p.wt-=dt;
      if(d<24||p.wt<=0){const w=cwPick();p.wx=w.x;p.wy=w.y;p.wt=cwR(2,5);dx=p.wx-p.x;dy=p.wy-p.y}
      const dd=Math.hypot(dx,dy)||1,s=p.sp,sw=Math.sin(T*p.f+p.ph)*s*.55;
      const dvx=dx/dd*s-dy/dd*sw,dvy=dy/dd*s+dx/dd*sw,k=Math.min(1,dt*2.2);
      p.vx+=(dvx-p.vx)*k;p.vy+=(dvy-p.vy)*k;
    }
    p.x+=p.vx*dt;p.y+=p.vy*dt;
    if(p.x<0){p.x=0;p.vx=Math.abs(p.vx)}else if(p.x>W){p.x=W;p.vx=-Math.abs(p.vx)}
    if(p.y<0){p.y=0;p.vy=Math.abs(p.vy)}else if(p.y>H){p.y=H;p.vy=-Math.abs(p.vy)}
  }
}
// state machine (no DOM). busy = the AI is working. Modes:
// intro (assemble, empty chat) -> idle | hold -> roam <-> regroup (the word) or act (a text/shape, every second stop) | fin (settle + fade) -> off
function cwSet(m){CW.mode=m;CW.mt=0;if(m!=='act'&&CW.cur!=='word'&&CW.tpl&&CW.P.length)cwUseTpl(CW.tpl,'word')} // leaving an act: dots go back to the word's places
function cwAdvance(dt,A){
  CW.T+=dt;CW.mt+=dt;
  const m=CW.mode;
  if(m==='off')return;
  if(m==='hold'||m==='roam'||m==='regroup'||m==='act')CW.wt+=dt; // seconds of this wait (the counter act shows it)
  if(CW.rm){ // reduced motion: only the still word, no movement
    for(const p of CW.P){p.x=A.x+(p.u-.5)*A.w;p.y=A.y+(p.v-.5)*A.h}
    if(m==='fin'){CW.al=0;cwSet('off')}else CW.al=1;
    return;
  }
  if(m==='act'&&CW.act){if(CW.act.fx){const f=CW.act.fx(CW.mt);A.s=f.s;A.rot=f.r}if(CW.act.k==='count')cwCountTick()}
  const form=m==='intro'||m==='idle'||m==='hold'||m==='regroup'||m==='act'||m==='fin';
  cwStep(CW.P,dt,form,A,CW.T,CW.mt);
  if(m==='intro'){CW.al=Math.min(1,CW.al+dt/.5);if(CW.mt>CW_TIME.intro)cwSet('idle')}
  else if(m==='hold'){CW.al=Math.min(1,CW.al+dt/.25);if(CW.mt>CW_TIME.hold){cwBurst(A);CW.rdur=cwRoamDur();if(CW.demo)CW.nextAct=true;cwSet('roam')}}
  else if(m==='roam'){CW.al=Math.min(1,CW.al+dt/.25);if(CW.mt>CW.rdur){if(CW.nextAct)cwEnterAct();else cwSet('regroup')}}
  else if(m==='regroup'){if(CW.mt>CW_TIME.regroup){cwBurst(A);CW.rdur=cwRoamDur();CW.nextAct=true;cwSet('roam')}}
  else if(m==='act'){CW.al=Math.min(1,CW.al+dt/.25);if(CW.mt>CW_TIME.act){cwBurst(A);CW.rdur=cwRoamDur();CW.nextAct=!!(CW.demo&&CW.force);cwSet('roam')}}
  else if(m==='fin'){CW.al=Math.max(0,CW.al-dt/(CW_TIME.finHold+CW_TIME.finFade));if(CW.al<=0)cwSet('off')} // fades while it settles, so the first lines of the answer stay readable
}
// who wants what: called every 250 ms. busy -> roam cycle; empty chat -> idle word; otherwise settle and stop.
function cwWant(busy,empty){
  const m=CW.mode;
  if(busy){
    if(m==='off'||m==='fin'){if(m==='off'){CW.al=0}cwSet('hold');CW.needSpawn='formed';CW.wt=0;CW.nextAct=false}
    else if(m==='idle'||m==='intro'){CW.needBurst=true;CW.rdur=cwRoamDur();CW.wt=0;CW.nextAct=!!CW.demo;cwSet('roam')}
    CW.miss=0;return;
  }
  if(m==='roam'||m==='regroup'||m==='hold'||m==='act'){cwSet('fin');return}
  if(empty){CW.miss=0;if(m==='off'){CW.al=0;cwSet('intro');CW.needSpawn='rand'}return}
  if(m==='idle'||m==='intro'){if(++CW.miss>=2){CW.miss=0;cwSet('fin')}}
}
// ---- DOM side ----
function cwOk(){return CW.on&&!CW.dead}
function cwOff(){CW.dead=true;CW.mode='off';CW.P=[];if(CW.cv)CW.cv.style.display='none';try{document.documentElement.classList.remove('cw')}catch(e){}}
function cwAnchor(){
  const chat=document.querySelector('#chat');if(!chat)return null;
  const R=chat.getBoundingClientRect();
  const pick=(sel,h0,left)=>{
    const el=document.querySelector(sel);if(!el)return null;
    const r=el.getBoundingClientRect();if(!r.width)return null;
    const h=Math.min(h0,r.width/CW.tpl.asp),w=h*CW.tpl.asp;
    return{x:(left?r.left+w/2+2:r.left+r.width/2)-R.left,y:r.top+r.height/2-R.top,w,h};
  };
  const idle=CW.mode==='intro'||CW.mode==='idle';
  const a=idle?(pick('.empty b',34)||pick('#ty .cwx',24,true)):(pick('#ty .cwx',24,true)||pick('.empty b',34));
  CW.R=R;return a;
}
function cwPlace(){
  const R=CW.R,B=document.body.getBoundingClientRect(),cv=CW.cv;
  cv.style.left=(R.left-B.left)+'px';cv.style.top=(R.top-B.top)+'px';
  cv.style.width=R.width+'px';cv.style.height=R.height+'px';
  const dpr=Math.min(2,window.devicePixelRatio||1);
  const pw=Math.round(R.width*dpr),ph=Math.round(R.height*dpr);
  if(cv.width!==pw||cv.height!==ph){cv.width=pw;cv.height=ph}
  CW.W=R.width;CW.H=R.height;CW.dpr=dpr;
}
function cwDraw(){
  const g=CW.g,dpr=CW.dpr;
  g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,CW.W,CW.H);
  if(CW.mode==='off'||CW.al<=0)return;
  g.globalAlpha=CW.al*(CW.mode==='roam'?.85:1);g.fillStyle=CW.col;g.beginPath();
  const still=CW.mode!=='roam'&&CW.mode!=='regroup'&&!CW.rm,T=CW.T;
  for(const p of CW.P){
    const x=p.x+(still?Math.sin(T*1.7+p.ph)*.3:0),y=p.y+(still?Math.cos(T*1.3+p.ph)*.3:0);
    g.moveTo(x+p.r,y);g.arc(x,y,p.r,0,6.2832);
  }
  g.fill();g.globalAlpha=1;
}
function cwFrame(dt){
  const a=cwAnchor();
  if(a)CW.anc=a;
  const A=a||CW.anc;
  if(!A){cwSet('off');return}
  cwPlace();
  if(CW.needSpawn){cwSpawn(CW.needSpawn,A);CW.needSpawn=null}
  const AA=CW.mode==='act'&&CW.actTpl?cwActAnchor():A; // an act is drawn in the middle of the chat area, the word stays at its anchor
  if(CW.needBurst){cwBurst(AA);CW.needBurst=false}
  cwAdvance(dt,AA);
  cwDraw();
  if(CW.mode==='off'){CW.cv.style.display='none';CW.P=[]}
}
function cwLoop(ts){
  CW.raf=0;
  if(CW.mode==='off'||CW.dead||document.hidden)return;
  try{
    if(ts-CW.last>=30){const dt=Math.min(.05,(ts-CW.last)/1000||.033);CW.last=ts;cwFrame(dt)}
  }catch(e){cwOff();return}
  if(CW.mode!=='off')CW.raf=requestAnimationFrame(cwLoop);
}
function cwKick(){
  if(CW.mode==='off')return;
  CW.cv.style.display='block';
  if(CW.rm){cwFrame(.033);return} // still word: redrawn on every 250 ms check
  if(CW.raf)return;
  CW.last=0;CW.raf=requestAnimationFrame(cwLoop);
}
function cwCheck(){
  if(!cwOk())return;
  try{
    const busyNow=typeof busy!=='undefined'&&busy&&!!document.querySelector('#ty .cwx');
    const empty=typeof H!=='undefined'&&!H.length&&!!document.querySelector('.empty b');
    const c=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();if(c)CW.col=c;
    if(!CW.tpl){CW.tpl=cwSample();if(!CW.tpl){cwOff();return}}
    cwWant(busyNow,empty);
    cwKick();
  }catch(e){cwOff()}
}
(function cwInit(){
  try{
    const cv=document.createElement('canvas');
    if(!cv.getContext)return;
    const g=cv.getContext('2d');if(!g)return;
    cv.className='cwc';cv.setAttribute&&cv.setAttribute('aria-hidden','true');
    const chat=document.querySelector('#chat');if(!chat||!chat.parentNode)return;
    chat.parentNode.insertBefore(cv,chat);
    CW.cv=cv;CW.g=g;CW.on=true;
    CW.rm=!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    document.documentElement.classList.add('cw');
    setInterval(cwCheck,250);
    document.addEventListener('visibilitychange',cwCheck);
    setTimeout(cwCheck,0);
  }catch(e){CW.on=false}
})();
