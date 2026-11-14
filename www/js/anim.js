// step27 (1.35000.0): waiting animation v1.
// Fine dots form the word "Chaman": in the middle of an empty chat, and in the status row (where the old dot was) while the AI works.
// On send the dots scatter over the CHAT AREA only, now and then regroup into "Chaman", and settle when the answer arrives.
// One canvas over #chat (pointer-events none). No native code. If canvas is missing or anything throws, the animation turns itself off
// and the old look stays. Pure maths (cwTplBuild, cwSpawn, cwStep, cwAdvance) has no DOM, so tests/sim-anim.js can run it in node.
const CW={on:false,dead:false,cv:null,g:null,mode:'off',P:[],tpl:null,W:0,H:0,dpr:1,raf:0,last:0,T:0,mt:0,al:0,col:'#6fb08f',anc:null,miss:0,rm:false,N:560,rdur:5,busy:false,tm:0};
const CW_TIME={hold:.5,regroup:1.7,finHold:.45,finFade:.35,intro:1.3,roamMin:4.5,roamMax:6.5};
const cwR=(a,b)=>a+Math.random()*(b-a);
// alphaAt(x,y) -> true where the word is inked, on a w*h raster. Returns N points in 0..1 plus the width/height ratio.
function cwTplBuild(alphaAt,w,h,N){
  N=N||CW.N;const pts=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(alphaAt(x,y))pts.push([x/w,y/h]);
  if(!pts.length)return null;
  for(let i=pts.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=pts[i];pts[i]=pts[j];pts[j]=t}
  const out=pts.slice(0,N);
  while(out.length<N){const q=pts[Math.floor(Math.random()*pts.length)];out.push([Math.min(1,Math.max(0,q[0]+cwR(-.01,.01))),Math.min(1,Math.max(0,q[1]+cwR(-.02,.02)))])}
  return{pts:out,asp:w/h};
}
// browser only: draw "Chaman" once on a hidden canvas and read the inked pixels
function cwSample(){
  const c=document.createElement('canvas'),H0=80;
  const g=c.getContext&&c.getContext('2d');if(!g)return null;
  const font='700 '+H0+'px ui-serif,Georgia,serif';
  g.font=font;const tw=Math.ceil(g.measureText('Chaman').width)+16;
  c.width=tw;c.height=Math.ceil(H0*1.4);
  g.font=font;g.textBaseline='alphabetic';g.fillStyle='#000';g.fillText('Chaman',8,H0);
  const d=g.getImageData(0,0,c.width,c.height).data;
  let x0=1e9,x1=-1,y0=1e9,y1=-1;
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(d[(y*c.width+x)*4+3]>110){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
  if(x1<0)return null;
  const w=x1-x0+1,h=y1-y0+1;
  return cwTplBuild((x,y)=>d[((y+y0)*c.width+(x+x0))*4+3]>110,w,h);
}
function cwPick(){return{x:cwR(10,Math.max(11,CW.W-10)),y:cwR(10,Math.max(11,CW.H-10))}}
// kind: 'rand' (start anywhere, then assemble) or 'formed' (start on the word)
function cwSpawn(kind,A){
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
  for(const p of P){
    if(form&&tm>=p.d){
      const tx=A.x+(p.u-.5)*A.w,ty=A.y+(p.v-.5)*A.h;
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
// intro (assemble, empty chat) -> idle | hold -> roam <-> regroup | fin (settle + fade) -> off
function cwSet(m){CW.mode=m;CW.mt=0}
function cwAdvance(dt,A){
  CW.T+=dt;CW.mt+=dt;
  const m=CW.mode;
  if(m==='off')return;
  if(CW.rm){ // reduced motion: only the still word, no movement
    for(const p of CW.P){p.x=A.x+(p.u-.5)*A.w;p.y=A.y+(p.v-.5)*A.h}
    if(m==='fin'){CW.al=0;cwSet('off')}else CW.al=1;
    return;
  }
  const form=m==='intro'||m==='idle'||m==='hold'||m==='regroup'||m==='fin';
  cwStep(CW.P,dt,form,A,CW.T,CW.mt);
  if(m==='intro'){CW.al=Math.min(1,CW.al+dt/.5);if(CW.mt>CW_TIME.intro)cwSet('idle')}
  else if(m==='hold'){CW.al=Math.min(1,CW.al+dt/.25);if(CW.mt>CW_TIME.hold){cwBurst(A);CW.rdur=cwR(CW_TIME.roamMin,CW_TIME.roamMax);cwSet('roam')}}
  else if(m==='roam'){CW.al=Math.min(1,CW.al+dt/.25);if(CW.mt>CW.rdur)cwSet('regroup')}
  else if(m==='regroup'){if(CW.mt>CW_TIME.regroup){cwBurst(A);CW.rdur=cwR(CW_TIME.roamMin,CW_TIME.roamMax);cwSet('roam')}}
  else if(m==='fin'){CW.al=Math.max(0,CW.al-dt/(CW_TIME.finHold+CW_TIME.finFade));if(CW.al<=0)cwSet('off')} // fades while it settles, so the first lines of the answer stay readable
}
// who wants what: called every 250 ms. busy -> roam cycle; empty chat -> idle word; otherwise settle and stop.
function cwWant(busy,empty){
  const m=CW.mode;
  if(busy){
    if(m==='off'||m==='fin'){if(m==='off'){CW.al=0}cwSet('hold');CW.needSpawn='formed'}
    else if(m==='idle'||m==='intro'){CW.needBurst=true;CW.rdur=cwR(CW_TIME.roamMin,CW_TIME.roamMax);cwSet('roam')}
    CW.miss=0;return;
  }
  if(m==='roam'||m==='regroup'||m==='hold'){cwSet('fin');return}
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
  if(CW.needBurst){cwBurst(A);CW.needBurst=false}
  cwAdvance(dt,A);
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
