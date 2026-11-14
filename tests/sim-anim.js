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
run(60);ok(ev("CW.mode==='roam'||CW.mode==='regroup'"),'60 s wait: still animating');
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
console.log(fail?'\nFAILED '+fail:'\nALL PASS '+pass);process.exit(fail?1:0);
