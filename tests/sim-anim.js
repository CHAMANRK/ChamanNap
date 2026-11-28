// step27: waiting animation v1 logic. Run: cd www && node ../tests/sim-anim.js
const vm=require('vm'),fs=require('fs');
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('PASS',m)}else{fail++;console.log('FAIL',m)}};
// no canvas in node: anim.js must stay quiet and leave the old look
const doc={createElement:()=>({}),querySelector:()=>null,documentElement:{classList:{add(){},remove(){}}},addEventListener(){}};
const ctx={document:doc,window:{},setInterval(){},setTimeout(){},console};
ctx.window=ctx;vm.createContext(ctx);
let threw=false;try{vm.runInContext(fs.readFileSync('js/anim.js','utf8'),ctx)}catch(e){threw=true;console.log(e)}
const ev=c=>vm.runInContext(c,ctx);
ok(!threw,'anim.js loads without canvas, no throw');
ok(ev('cwOk()')===false,'no canvas -> animation off (old look stays)');
// template from a fake word (100x20 block)
ev("CW.W=360;CW.H=600;CW.tpl=cwTplBuild((x,y)=>x>5&&x<95&&y>3&&y<17,100,20);");
ok(ev('CW.tpl.pts.length')===ev('CW.N'),'template has exactly N dots');
ok(ev('CW.tpl.pts.every(q=>q[0]>=0&&q[0]<=1&&q[1]>=0&&q[1]<=1)'),'dots inside 0..1');
ok(Math.abs(ev('CW.tpl.asp')-5)<1e-9,'width/height ratio kept');
ok(ev('cwTplBuild(()=>false,10,10)')===null,'empty word -> null (animation turns off instead of crashing)');
// form: dots reach the word
const A='{x:180,y:300,w:120,h:24}';
ev("cwSpawn('rand',"+A+");CW.mode='regroup';CW.T=0;CW.mt=0;for(let i=0;i<120;i++){CW.T+=.033;CW.mt+=.033;cwStep(CW.P,.033,true,"+A+",CW.T,CW.mt)}");
const md=ev("CW.P.reduce((s,p)=>s+Math.hypot(p.x-(180+(p.u-.5)*120),p.y-(300+(p.v-.5)*24)),0)/CW.P.length");
ok(md<1.5,'all dots settle on the word (mean error '+md.toFixed(2)+'px)');
// roam: stay inside the chat area, and visit the whole area
ev("cwBurst("+A+");const seen=new Set();for(let i=0;i<400;i++){CW.T+=.033;cwStep(CW.P,.033,false,"+A+",CW.T,9);for(const p of CW.P)seen.add(Math.floor(p.x/60)+','+Math.floor(p.y/100))}globalThis.SEEN=seen.size");
ok(ev("CW.P.every(p=>p.x>=0&&p.x<=360&&p.y>=0&&p.y<=600)"),'dots never leave the chat area');
ok(ev('SEEN')>=40,'dots reach most of the area ('+ev('SEEN')+'/60 cells)');
// state machine
const run=(sec)=>ev("for(let i=0;i<"+Math.round(sec/.033)+";i++)cwAdvance(.033,"+A+")");
ev("cwSpawn('formed',"+A+");CW.al=0;CW.rm=false;cwSet('hold')");
run(.3);ok(ev('CW.mode')==='hold','hold first (word shows)');
run(.4);ok(ev('CW.mode')==='roam','then scatter');
const rd=ev('CW.rdur');ok(rd>=4.5&&rd<=6.5,'roam lasts 4.5-6.5 s ('+rd.toFixed(1)+')');
run(rd+.2);ok(ev('CW.mode')==='regroup','then regroup into the word');
run(1.8);ok(ev('CW.mode')==='roam','and scatter again (loops for as long as the wait lasts)');
// a long wait keeps cycling, never ends by itself
run(60);ok(ev("CW.mode==='roam'||CW.mode==='regroup'||CW.mode==='act'"),'60 s wait: still animating');
// answer arrives
ev("cwWant(false,false)");ok(ev('CW.mode')==='fin','answer arrives -> settle');
run(.3);ok(ev('CW.al')>0&&ev('CW.al')<1&&ev('CW.mode')==='fin','word settles while fading (answer stays readable)');
run(1);ok(ev('CW.mode')==='off','then fades out and stops');
// wants
ev("CW.mode='off';CW.al=0");ev("cwWant(false,true)");ok(ev('CW.mode')==='intro'&&ev('CW.needSpawn')==='rand','empty chat -> assemble the word');
ev("cwWant(true,false)");ok(ev('CW.mode')==='roam','first message -> scatter at once');
ev("CW.mode='idle';CW.miss=0;cwWant(false,false)");ok(ev('CW.mode')==='idle','one missed check does not drop the idle word');
ev("cwWant(false,false)");ok(ev('CW.mode')==='fin','two missed checks do');
ev("CW.mode='fin';cwWant(true,false)");ok(ev('CW.mode')==='hold','new message while settling -> start again');
// reduced motion: still word only
ev("CW.rm=true;cwSpawn('rand',"+A+");cwSet('idle')");run(.1);
ok(ev("CW.P.every(p=>Math.abs(p.x-(180+(p.u-.5)*120))<1e-6)")&&ev('CW.al')===1,'reduced motion: still word, no movement');

// even sampling (acts): no two dots on top of each other, and the plain word template is unchanged
{const w=400,h=80;
 const e=ev("cwTplBuild((x,y)=>x>20&&x<380&&y>12&&y<68,400,80,0,true)");
 let mind=1e9;for(let i=0;i<e.pts.length;i++)for(let j=i+1;j<e.pts.length;j++){const dx=(e.pts[i][0]-e.pts[j][0])*w,dy=(e.pts[i][1]-e.pts[j][1])*h;mind=Math.min(mind,Math.hypot(dx,dy))}
 ok(e.pts.length===560&&mind>3,'even sampling: N dots, none stacked (closest '+mind.toFixed(2)+' px)')}
// ---- v2: acts (3 texts + 3 shapes) and /anim demo ----
// fake templates: the node sandbox has no canvas, so text samplers are stubbed; shapes are pure maths and run for real
ev("cwTextTpl=(s)=>cwTplBuild((x,y)=>x>2&&x<10*s.length&&y>2&&y<18,12*s.length,20)");
ok(ev("CW_ACTS.length")===14&&ev("CW_ACTS.map(a=>a.n).join()")==='soch,bas,counter,ruk,dimag,chai,net,heart,ring,star,clock,bolt,smile,tick','14 acts: 7 texts + 7 shapes');
ok(ev("cwFindAct('dil').n")==='heart'&&ev("cwFindAct('tara').n")==='star'&&ev("cwFindAct('ghadi').n")==='clock'&&ev("cwFindAct('bijli').n")==='bolt'&&ev("cwFindAct('smiley').n")==='smile'&&ev("cwFindAct('so').n")==='soch'&&ev("cwFindAct('xyz')")===null,'/anim names: alias, prefix, unknown');
for(const n of ['heart','ring','star','bolt','tick','clock','smile']){
  const t=ev("cwShapeTpl(cwFindAct('"+n+"'))");
  ok(t&&t.pts.length===560,n+' shape template has N dots');
}
ok(ev("cwHeart(0,0)")&&!ev("cwHeart(.95,-.95)")&&ev("cwStar(0,0)")&&!ev("cwStar(.95,.95)")&&!ev("cwRing(0,0)")&&ev("cwRing(-.85,0)")&&!ev("cwRing(.85,0)"),'shape maths: heart/star filled, ring hollow with a gap');
const hb=ev("(()=>{const t=cwShapeTpl(cwFindAct('heart'));return t.asp})()");
ok(hb>.9&&hb<1.4,'heart box trimmed (asp '+hb.toFixed(2)+')');
// v2.1: clock hands and smiley eyes are groups of dots that move on their own
{const ck=ev("cwShapeTpl(cwFindAct('clock'))"),sm=ev("cwShapeTpl(cwFindAct('smile'))");
 const cnt=(t,g)=>t.g.filter(x=>x===g).length;
 ok(ck.g.length===560&&cnt(ck,0)>250&&cnt(ck,1)>80&&cnt(ck,2)>60,'clock: face + minute hand + hour hand dots ('+cnt(ck,0)+'/'+cnt(ck,1)+'/'+cnt(ck,2)+')');
 ok(sm.g.length===560&&cnt(sm,0)>380&&cnt(sm,1)>120&&sm.gc[1][1]<.45,'smiley: face + eyes (eyes sit above the middle)');
 // minute hand points up at angle 0 and turns clockwise: at 90 deg its dots are right of the centre
 ev("CW.W=360;CW.H=600;CW.cur='x'");
 const A3="{x:180,y:300,w:96,h:96,hd:[0,Math.PI/2,0]}";
 ev("CW.P=[];cwSpawn('formed',{x:180,y:300,w:96,h:24});cwUseTpl(globalThis.CKT=cwShapeTpl(cwFindAct('clock')),'clock');for(let i=0;i<150;i++)cwStep(CW.P,.033,true,"+A3+",i*.033,9)");
 const mh=ev("(()=>{const a=CW.P.filter(p=>p.g===1);return[a.reduce((s,p)=>s+p.x,0)/a.length-180,a.reduce((s,p)=>s+p.y,0)/a.length-300]})()");
 ok(mh[0]>10&&Math.abs(mh[1])<8,'minute hand at 90 deg points right ('+mh[0].toFixed(0)+','+mh[1].toFixed(0)+')');
 ev("cwUseTpl(globalThis.SMT=cwShapeTpl(cwFindAct('smile')),'smile')");
 const eyeSpread=k=>ev("(()=>{CW.P.forEach(p=>{p.x=180;p.y=300});for(let i=0;i<150;i++)cwStep(CW.P,.033,true,{x:180,y:300,w:96,h:96,sq:"+k+",gcy:(SMT.gc[1][1]-.5)*96},i*.033,9);const e=CW.P.filter(p=>p.g===1).map(p=>p.y);return Math.max(...e)-Math.min(...e)})()");
 const open=eyeSpread(1),shut=eyeSpread(.1);
 ok(shut<open*.4,'blink: eyes squash ('+open.toFixed(1)+' -> '+shut.toFixed(1)+' px tall)');
 ok(ev("CW_ACTS.find(a=>a.n==='clock').fx(1).hd[1]")>ev("CW_ACTS.find(a=>a.n==='clock').fx(.5).hd[1]")&&ev("CW_ACTS.find(a=>a.n==='smile').fx(.9).sq")<.5&&ev("CW_ACTS.find(a=>a.n==='smile').fx(.3).sq")===1,'clock turns, smiley blinks once a second');
 ok(ev("cwBolt(.1,-.5)")&&!ev("cwBolt(-.8,-.8)")&&ev("cwTick(.5,-.3)")&&ev("cwTick(-.5,.28)")&&!ev("cwTick(.6,.6)"),'bolt and tick shapes');
 ev("cwUseTpl(CW.tpl,'word')");ok(ev("CW.P.every(p=>p.g===0)"),'back to the word: no dot keeps a group');
}
// normal wait: word first, then an act at every second stop, then the word again
const A2="{x:180,y:300,w:120,h:24}";
const adv=(sec)=>ev("for(let i=0;i<"+Math.round(sec/.033)+";i++)cwAdvance(.033,"+(ev("CW.mode")==='act'?"cwActAnchor()":A2)+")");
ev("CW.rm=false;CW.demo=0;CW.force='';CW.mode='off';CW.al=0;cwWant(true,false);cwSpawn('formed',"+A2+");CW.needSpawn=null");
ok(ev('CW.nextAct')===false&&ev('CW.wt')===0,'new wait: first stop is the word, wait clock starts at 0');
const seq=[];let guard=0,last='';
while(guard++<4000){adv(.033);const m=ev('CW.mode');if(m!==last){seq.push(m);last=m}if(seq.filter(x=>x==='act').length>=2&&m==='roam')break}
ok(seq.join('>').indexOf('hold>roam>regroup>roam>act>roam>regroup>roam>act')===0,'order: hold, roam, WORD, roam, ACT, roam, WORD, roam, ACT ('+seq.slice(0,10).join('>')+')');
ok(ev('CW.wt')>15,'wait clock keeps counting through acts ('+ev('CW.wt').toFixed(1)+' s)');
// an act: dots reach the act's shape in the middle of the area, and every dot stays inside
ev("CW.demo=0;CW.force='star';CW.nextAct=true;CW.mode='roam';CW.mt=99;CW.rdur=1;cwAdvance(.033,"+A2+")");
ok(ev('CW.mode')==='act'&&ev('CW.act.n')==='star'&&ev('CW.cur')==='star','act starts, dots take the act template');
adv(2);
const aa=ev("cwActAnchor()");
ok(Math.abs(aa.x-180)<1&&aa.y>200&&aa.y<300,'act sits in the middle of the chat area');
ok(ev("CW.P.every(p=>p.x>=0&&p.x<=360&&p.y>=0&&p.y<=600)"),'act dots stay inside the chat area');
const maxd=ev("(()=>{const A=cwActAnchor();return Math.max(...CW.P.map(p=>Math.hypot(p.x-A.x,p.y-A.y)))})()");
ok(maxd<aa.h*1.3,'dots are gathered on the star (farthest '+maxd.toFixed(0)+'px of '+aa.h.toFixed(0)+')');
adv(1);ok(ev('CW.mode')==='roam'&&ev('CW.cur')==='word','after the act: scatter, dots go back to the word places');
// spin: ring target rotates
ev("CW.force='ring';CW.mode='roam';CW.mt=99;CW.rdur=1;CW.nextAct=true;cwAdvance(.033,"+A2+")");
ev("globalThis.R1=cwActAnchor();globalThis.X1=CW.P[0].x");adv(.8);
ok(ev("CW.act.fx(1).r")>ev("CW.act.fx(.5).r")&&ev("CW.act.fx(.3).s")===1,'ring spins, does not pulse');
ok(ev("CW_ACTS.find(a=>a.n==='heart').fx(.05).s")>1.05&&ev("CW_ACTS.find(a=>a.n==='heart').fx(.5).s")===1,'heart pulses (beat), rests between beats');
// counter shows the seconds of the wait and updates
ev("CW.force='counter';CW.wt=9.2;CW.mode='roam';CW.mt=99;CW.rdur=1;CW.nextAct=true;cwAdvance(.033,"+A2+")");
ok(ev('CW.ctxt')==='9s','counter act shows 9s');
ev("CW.wt=12.5;cwAdvance(.033,cwActAnchor())");
ok(ev('CW.ctxt')==='12s','counter updates when the second changes');
// answer arrives during an act: settle on the word and fade
ev("cwWant(false,false)");ok(ev('CW.mode')==='fin'&&ev('CW.cur')==='word','answer during an act -> back to the word, then fade');
adv(1);ok(ev('CW.mode')==='off','and stop');
// act template cannot be built (no canvas): act is skipped, wait goes on with the word, no crash
ev("CW.ac={};cwTextTpl=()=>null;CW.force='soch';CW.demo=0;CW.mode='roam';CW.P.length||cwSpawn('formed',"+A2+");CW.mt=99;CW.rdur=1;CW.nextAct=true;cwAdvance(.033,"+A2+")");
ok(ev('CW.mode')==='regroup'&&ev("cwFindAct('soch').dead")===1,'no text template -> act skipped, no crash');
// /anim demo
ev("CW_ACTS.forEach(a=>delete a.dead);CW.force='';CW.demo=0;CW.rm=false");
const id=ev("cwDemo('')");ok(id>0&&ev('CW.demo')===id,'cwDemo on');
ev("CW.mode='hold';CW.mt=99;cwAdvance(.033,"+A2+")");
ok(ev('CW.mode')==='roam'&&ev('CW.nextAct')===true&&ev('CW.rdur')<=2.4,'demo: short roam, act comes first');
ev("cwDemoEnd(999)");ok(ev('CW.demo')===id,'old demo id cannot end a newer demo');
ev("cwDemoEnd("+id+")");ok(ev('CW.demo')===0,'demo ends');
ok(ev("CW.rdur")>0&&ev("(()=>{CW.demo=0;let m=1e9,M=0;for(let i=0;i<50;i++){const d=cwRoamDur();m=Math.min(m,d);M=Math.max(M,d)}return m>=4.5&&M<=6.5})()"),'real wait: roam still 4.5-6.5 s');
// animCmd (node: H, busy stubs)
ctx.setInterval=setInterval;ctx.clearInterval=clearInterval; // real timers for animCmd (the load-time stub only had to keep anim.js quiet)
ev("var H=[];var busy=true;CW.on=true;CW.dead=false;CW.rm=false;var S={anim:{on:true}}");
// U1 (1.42000.0): parked by default, Settings > Waiting animation turns it on
ok(ev("cwUser()")===true&&ev("cwOk()")===true,'S.anim.on=true -> animation allowed');
ev("S.anim.on=false");ok(ev("cwUser()")===false&&ev("cwOk()")===false,'S.anim off (default) -> parked, cwOk false (status row keeps the plain look)');
ev("S.anim={}");ok(ev("cwUser()")===false,'S.anim without on -> parked');
ev("S.anim={on:true}");
// ---- live voice ring (1.53000.0) ----
ev("S.anim={};CW.rm=false;CW.W=360;CW.H=600;CW.live='';CW.lv=false;CW.mode='off';CW.P=[];CW.cur='word';CW.needSpawn=null");
ok(ev("cwActive()")===false,'live off + animation parked -> not active');
let lt=false;try{ev("cwLive('listen')")}catch(e){lt=true}
ok(!lt,'cwLive does not throw when classList.toggle is missing');
ok(ev("cwActive()")===true&&ev("cwUser()")===false&&ev("CW.live")==='listen','live voice mode makes it active while Settings > Waiting animation stays Off');
ok(ev("(()=>{const t=cwShapeTpl({f:cwOrb});return !!t&&t.pts.length===CW.N&&t.pts.every(q=>{const r=Math.hypot(q[0]*2-1,q[1]*2-1);return r<=1.01})})()"),'disc template: N dots, all inside one round disc');
const fxs=st=>ev("(()=>{const o=[];for(let i=0;i<400;i++)o.push(cwLiveFx('"+st+"',i*.01));return[Math.min(...o),Math.max(...o)]})()");
const fl=fxs('listen'),ft=fxs('think'),fs2=fxs('speak');
ok(fl[1]<=1.021&&fl[0]>=.979,'listen: only a slow breath ('+fl.map(x=>x.toFixed(3))+')');
ok(ft[1]>=1.25&&ft[0]>=.999,'think: heart-like beat, up to +28% ('+ft.map(x=>x.toFixed(3))+')');
ok(fs2[1]>1.06&&fs2[0]<.94,'speak: soft rhythm around 1 ('+fs2.map(x=>x.toFixed(3))+')');
ev("cwLiveEnter()");
ok(ev("CW.mode")==='live'&&ev("CW.lv")===true&&ev("CW.needSpawn")==='rand'&&ev("CW.al")===0,'live starts: dots come from everywhere, fade in');
ev("cwSpawn('rand',cwLiveAnchor());CW.needSpawn=null;cwUseTpl(CW.orbTpl,'orb')");
const runL=sec=>ev("for(let i=0;i<"+Math.round(sec/.033)+";i++)cwAdvance(.033,cwLiveAnchor())");
runL(3);
const rg=ev("(()=>{const A=cwLiveAnchor(),R=A.w/2,rs=CW.P.map(p=>Math.hypot(p.x-A.x,p.y-A.y)/R);return[Math.min(...rs),Math.max(...rs),CW.al,CW.mode]})()");
ok(rg[1]<=1.14&&rg[2]===1&&rg[3]==='live','all dots gather into the disc ('+rg.slice(0,2).map(x=>x.toFixed(2))+'), fully visible, mode stays live');
ok(ev("(()=>{const A=cwLiveAnchor(),R=A.w/2;let c=0;for(const p of CW.P)if(Math.hypot(p.x-A.x,p.y-A.y)<R*.5)c++;return c>CW.P.length*.15})()"),'disc is filled: dots also in the middle');
ok(ev("(()=>{const A=cwLiveAnchor();return A.x===180&&A.y===270&&A.w===A.h&&A.w<=230&&A.w>=60})()"),'ring sits in the middle of the chat area');
const beat=st=>ev("(()=>{CW.live='"+st+"';let mn=1e9,mx=0;for(let i=0;i<150;i++){const A=cwLiveAnchor();cwAdvance(.033,A);const r=CW.P.reduce((s,p)=>s+Math.hypot(p.x-A.x,p.y-A.y),0)/CW.P.length;if(i>40){mn=Math.min(mn,r);mx=Math.max(mx,r)}}return mx/mn})()");
const bt=beat('think'),bl=beat('listen');
ok(bt>1.10,'waiting for the AI: the ring really beats on screen (x'+bt.toFixed(3)+')');
ok(bl<1.08&&bl<bt,'listening: calmer than the beat (x'+bl.toFixed(3)+')');
ev("CW.live='listen';CW.rm=true;CW.al=0;cwAdvance(.033,cwLiveAnchor())");
ok(ev("CW.al")===1&&ev("(()=>{const A=cwLiveAnchor(),p=CW.P[0];return Math.hypot(p.x-(A.x+(p.u-.5)*A.w),p.y-(A.y+(p.v-.5)*A.h))<1e-6})()"),'reduced motion: still ring, no movement');
ev("CW.rm=false");
ev("CW.live='';cwSet('fin')");
ok(ev("CW.cur")==='orb','live ended: ring fades out in place (dots do not fly to the word)');
runL(1.2);ok(ev("CW.mode")==='off','then it stops');
ev("CW.lv=false;CW.cur='orb';cwSet('fin')");ok(ev("CW.cur")==='word','normal wait (not live): old behaviour, dots go back to the word');
ev("CW.mode='off';CW.P=[];CW.cur='word';CW.lv=false;CW.live='';CW.rm=false;S.anim={on:true}");
ok(/vlive/.test(fs.readFileSync('css/style.css','utf8'))&&/#micb\.live/.test(fs.readFileSync('css/style.css','utf8')),'css: chat dims behind the ring, mic button has a live look');
(async()=>{
  ev("S.anim.on=false");await ev("animCmd('')");ok(/park/.test(ev("H[0].content")),'/anim while parked says it is parked');ev("H.length=0;S.anim.on=true");
  await ev("animCmd('list')");ok(ev("H.length")===1&&/soch, bas, counter, ruk, dimag, chai, net, heart, ring, star, clock, bolt, smile, tick/.test(ev("H[0].content"))&&/ghadi = clock/.test(ev("H[0].content")),'/anim list names the acts and aliases');
  await ev("animCmd('xyz')");ok(/nahi mila/.test(ev("H[1].content")),'/anim unknown name says so');
  ev("CW.rm=true");await ev("animCmd('')");ok(/reduced motion/.test(ev("H[2].content"))&&ev('CW.demo')===0,'reduced motion: no demo, clear message');
  ev("CW.rm=false;CW.on=false");await ev("animCmd('heart')");ok(/band hai/.test(ev("H[3].content")),'no canvas: clear message');
  // demo runs while busy, ends by itself when the turn stops (Stop pressed)
  ev("CW.on=true;busy=true");const pr=ev("animCmd('heart')");
  ok(ev('CW.demo')>0&&ev('CW.force')==='heart','/anim heart: demo on, only heart');
  ev("busy=false");await pr;
  ok(ev('CW.demo')===0&&ev('H.length')===4,'Stop (busy off): demo ends, no "khatam" message');
  console.log(fail?'\nFAILED '+fail:'\nALL PASS '+pass);process.exit(fail?1:0);
})();
