// step20: face lock. Run: cd www && node ../tests/sim-face.js
const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',checked:false,style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(t,f){handlers[sel+':'+t]=f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},textContent:''};
 let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}},addEventListener(){},hidden:false};
const store={};
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('PASS',m)}else{fail++;console.log('FAIL',m)}};
// ---- fake FaceLock plugin ----
const F={hasData:false,hang:false,cancelled:0,missingCode:undefined,enrolled:3,modelOk:true,remainMs:0,verifyResults:[],verifyCalls:[],cfg:null,progress:{active:false,text:'',state:'run'},missing:false,camera:true};
const native=[],lines=[];
const faceNative=async(m,o)=>{
 if(F.missing){const e=new Error('plugin missing');if(F.missingCode)e.code=F.missingCode;throw e}
 if(m==='status')return{modelOk:F.modelOk,enrolled:F.enrolled,camera:F.camera,remainMs:F.remainMs,hasData:F.hasData,active:F.modelOk&&(F.enrolled>0||F.hasData),a11y:true,lastUnknownAt:0};
 if(m==='cancel'){F.cancelled++;return{ok:true}}
 if(m==='clearTrust'){F.remainMs=0;F.clears=(F.clears||0)+1;return{ok:true}}
 if(m==='config'){F.cfg=o;return{ok:true}}
 if(m==='progress')return F.progress;
 if(m==='verify'){
  F.verifyCalls.push(o);
  if(F.hang)await new Promise(()=>{});
  F.progress={active:true,text:'Blink karo (ek baar)',state:'wait'};
  await new Promise(r=>setTimeout(r,30));
  const r=F.verifyResults.shift()||{result:'owner',score:0.7,threshold:0.5};
  F.progress={active:false,text:'x',state:'ok'};
  if(r.result==='owner'&&o.grant!==false)F.remainMs=30*60000;
  if(r.throw){const e=new Error(r.message||'x');e.code=r.throw;throw e}
  return r;
 }
 if(m==='clearFaces'){F.enrolled=0;return{ok:true}}
 return{ok:true};
};
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,5)),clearTimeout,URL,Image:function(){},fetch:async()=>{throw new Error('no net')}};
ctx.window=ctx;
ctx.Capacitor={nativePromise:async(pl,m,o)=>{
 if(pl==='FaceLock')return faceNative(m,o||{});
 if(m==='line'){lines.push(o);return{ok:true}}
 native.push(pl+'.'+m);
 if(m==='read')return{pkg:'com.whatsapp',items:[{i:1,k:'T',t:'Chats'}]};
 if(m==='click')return{label:'Send'};
 if(m==='key')return{ok:true};
 if(m==='activity')return{count:0,kbd:false};
 if(m==='torch')return{on:true};
 return{}}};
vm.createContext(ctx);
for(const f of ['version','prompts','core','status','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','intents','termuxapi','runner','imagegen','rules','log','face','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
const run=(code)=>vm.runInContext(code,ctx);
const exec=async(name,args)=>{const steps=[];const r=await run('execTool')(name,args,steps);return{r,steps}};
const nat=name=>native.filter(x=>x===name).length;
(async()=>{
 // 0. defaults + tool registration
 const d=run('flCfg()');
 ok(d.on&&d.min===30&&d.areas.join()==='screen,termux','defaults: on, 30 min, only screen + termux');
 ok(run("TOOLS.some(t=>t.function.name==='who_is_there')"),'who_is_there tool registered');
 await new Promise(r=>setTimeout(r,60));
 ok(F.cfg&&F.cfg.ttlMin===30&&F.cfg.areas.join()==='screen,termux'&&F.cfg.master===true,'config pushed to native at boot');
 ok(run("flArea('screen_click',{})")==='screen'&&run("flArea('termux_run',{})")==='termux'&&run("flArea('file_write',{})")==='files'&&run("flArea('send_sms',{})")==='comms'&&run("flArea('memory_save',{})")==='memory','areas mapped');
 ok(run("flArea('screen_key',{key:'lock'})")===null&&run("flArea('file_present',{})")===null&&run("flArea('who_is_there',{})")===null&&run("flArea('rules_read',{})")===null,'lock key, file_present, who_is_there, rules_read never gated');

 // 1. not gated area: torch does not touch the camera
 F.verifyCalls.length=0;
 await exec('torch',{state:'on'});
 ok(F.verifyCalls.length===0&&nat('PhoneControl.torch')===1,'torch (area off) runs without face check');

 // 2. owner: first screen tool verifies, window then covers the next ones
 F.verifyResults=[{result:'owner',score:0.71,threshold:0.5}];
 let x=await exec('screen_click',{id:1});
 ok(F.verifyCalls.length===1&&nat('ScreenControl.click')===1,'owner: screen_click verified once and ran');
 ok(F.verifyCalls[0].grant===true,'verify asks native to start the trust window');
 x=await exec('screen_click',{id:2});
 ok(F.verifyCalls.length===1&&nat('ScreenControl.click')===2,'second tool inside the window: no camera');
 ok(lines.some(l=>/Blink karo/.test(l.text||'')),'status line showed "Blink karo (ek baar)"');
 ok(lines.some(l=>/Face check|Face verify ho gaya/.test(l.text||'')),'status line showed face check text');

 // 3. window over, unknown face: tool blocked, cooldown 60s
 F.remainMs=0;F.verifyResults=[{result:'unknown',score:0.2,threshold:0.5,locked:true,photo:'/sdcard/Chaman/intruder/x.jpg'}];
 let c0=nat('ScreenControl.click');
 x=await exec('screen_click',{id:3});
 ok(/FACE_UNKNOWN/.test(x.r)&&/lock kar diya/.test(x.r)&&/photo save/.test(x.r),'unknown: result says unknown, locked, photo saved');
 ok(nat('ScreenControl.click')===c0,'unknown: tool did NOT run');
 const v1=F.verifyCalls.length;
 x=await exec('termux_run',{command:'ls'});
 ok(/FACE_UNKNOWN/.test(x.r)&&F.verifyCalls.length===v1,'cooldown: next gated tool denied without camera');
 ok(run("LOGQ.some(l=>/unknown/.test(l.text))"),'log has the unknown event');
 run('FL_DENY=0');

 // 4. noface / noblink / unclear: blocked, no lock text, no cooldown
 for(const [res,rx] of [['noface',/FACE_NOT_SEEN/],['noblink',/Blink/],['unclear',/saaf nahi/]]){
  F.remainMs=0;F.verifyResults=[{result:res}];c0=nat('ScreenControl.click');
  x=await exec('screen_click',{id:4});
  ok(rx.test(x.r)&&nat('ScreenControl.click')===c0&&!/lock kar diya/.test(x.r),res+': blocked, not treated as unknown');
 }
 ok(run('FL_DENY')===0,'noface/noblink/unclear do not start the cooldown');

 // 5. plugin error codes
 F.remainMs=0;F.verifyResults=[{throw:'NO_CAMERA',message:'Camera permission chahiye.'}];
 x=await exec('termux_run',{command:'ls'});
 ok(/FACE_ERROR/.test(x.r)&&/Camera permission/.test(x.r),'no camera permission -> FACE_ERROR, tool blocked');

 // 6. lock key is always allowed
 F.remainMs=0;F.verifyCalls.length=0;
 x=await exec('screen_key',{key:'lock'});
 ok(F.verifyCalls.length===0&&nat('ScreenControl.key')===1,'screen_key lock needs no face');

 // 7. nothing to verify against -> no gate
 F.enrolled=0;F.remainMs=0;F.verifyCalls.length=0;c0=nat('ScreenControl.click');
 x=await exec('screen_click',{id:5});
 ok(F.verifyCalls.length===0&&nat('ScreenControl.click')===c0+1,'not enrolled: tool runs, no camera');
 F.enrolled=3;F.modelOk=false;x=await exec('screen_click',{id:6});
 ok(F.verifyCalls.length===0&&nat('ScreenControl.click')===c0+2,'model missing: no gate');
 F.modelOk=true;
 F.missing=true;F.missingCode='UNIMPLEMENTED';x=await exec('screen_click',{id:7});
 ok(/Click/.test(x.r),'plugin not in this APK (UNIMPLEMENTED): no gate, tool runs');
 F.missingCode=undefined;c0=nat('ScreenControl.click');x=await exec('screen_click',{id:7});
 ok(/FACE_ERROR/.test(x.r)&&nat('ScreenControl.click')===c0,'status call fails on Android: tool BLOCKED (fail closed)');
 F.missing=false;
 F.enrolled=0;F.hasData=true;F.remainMs=0;F.verifyResults=[{result:'error',code:'NOT_ENROLLED',message:'Koi face enroll nahi hai'}];c0=nat('ScreenControl.click');
 x=await exec('screen_click',{id:7});
 ok(/FACE_ERROR/.test(x.r)&&/kharab/.test(x.r)&&nat('ScreenControl.click')===c0,'damaged faces file: tool blocked, not silently open');
 F.enrolled=3;F.hasData=false;

 // 8. toggles: master off, area off, files on
 run("S.fl=Object.assign({},flCfg(),{on:false})");F.remainMs=0;F.verifyResults=[{result:'noface'}];
 x=await exec('screen_click',{id:8});
 ok(/Click/.test(x.r),'master off: no check');
 run("S.fl=Object.assign({},flCfg(),{on:true,areas:['files']})");
 x=await exec('screen_click',{id:9});
 ok(/Click/.test(x.r),'screen toggled off: no check');
 const fb=F.verifyCalls.length;x=await exec('file_list',{path:'/sdcard/Chaman'});
 ok(F.verifyCalls.length===fb+1&&/FACE_NOT_SEEN/.test(x.r),'files toggled on: file_list is gated');
 run("S.fl=undefined");

 // 9. native second lock: FACE_REQUIRED from the plugin
 const old=ctx.Capacitor.nativePromise;
 ctx.Capacitor.nativePromise=async(pl,m,o)=>{if(pl==='ScreenControl'&&m==='click'){const e=new Error('Face verify chahiye.');e.code='FACE_REQUIRED';throw e}return old(pl,m,o)};
 F.remainMs=30*60000;
 x=await exec('screen_click',{id:10});
 ok(/FACE_NOT_VERIFIED/.test(x.r),'native FACE_REQUIRED mapped to a clear result');
 ctx.Capacitor.nativePromise=old;

 // 10. concurrent verifies share one camera run
 F.remainMs=0;F.verifyCalls.length=0;F.verifyResults=[{result:'owner',score:0.8,threshold:0.5}];
 const [a,b]=await Promise.all([run("faceGate('screen_click',{})"),run("faceGate('termux_run',{})")]);
 ok(F.verifyCalls.length===1&&a===null&&b===null,'two tools at once: one camera run');

 // 11. who_is_there
 F.remainMs=0;F.verifyCalls.length=0;F.verifyResults=[{result:'owner',score:0.66,threshold:0.5}];
 x=await exec('who_is_there',{});
 ok(/Najeef hai/.test(x.r)&&F.verifyCalls[0].lock===false&&F.verifyCalls[0].grant===true,'who_is_there: owner, never locks the phone');
 F.remainMs=0;F.verifyResults=[{result:'unknown',score:0.1,threshold:0.5,photo:'/p.jpg',locked:false}];
 x=await exec('who_is_there',{});
 ok(/unknown insaan/.test(x.r)&&/Photo save/.test(x.r),'who_is_there: unknown reported');
 F.enrolled=0;x=await exec('who_is_there',{});
 ok(/enroll/.test(x.r),'who_is_there: not enrolled message');F.enrolled=3;

 // 12. settings UI
 const h=run('flHtml()');
 ok(/Face enroll karo/.test(h)&&/fl_a_screen" checked/.test(h)&&/fl_a_termux" checked/.test(h)&&!/fl_a_files" checked/.test(h),'settings html: enroll button, screen+termux ticked, files not');
 ok(['screen','termux','files','comms','links','code','memory','image','device'].every(id=>h.indexOf('fl_a_'+id)>0),'settings html: all 9 area toggles');
 ok(/App kholne par face check nahi/.test(h),'settings html says app open is not gated');
 const sh=run('sheet.toString()');
 ok(/flHtml/.test(sh)&&/flBind/.test(sh)&&/flRead/.test(sh),'settings.js is wired to face.js');
 ok(await run('flStatusText()').then(t=>/Enrolled samples: 3/.test(t)),'status text');

 // 12b. hang: native never answers -> timeout, cancel, next verify works
 run('FL_TIMEOUT=60');F.hang=true;F.remainMs=0;F.cancelled=0;c0=nat('ScreenControl.click');
 x=await exec('screen_click',{id:11});
 ok(/FACE_ERROR/.test(x.r)&&/time khatam/.test(x.r)&&nat('ScreenControl.click')===c0,'verify hang: times out, tool blocked');
 ok(F.cancelled===1,'verify hang: native cancel called');
 ok(run('FL_BUSY')===null,'verify hang: busy flag cleared');
 F.hang=false;run('FL_TIMEOUT=45000');F.remainMs=0;F.verifyResults=[{result:'owner',score:0.7,threshold:0.5}];
 x=await exec('screen_click',{id:12});
 ok(/Click/.test(x.r),'after a timeout the next check works');

 // 12c. owner guard
 F.remainMs=0;F.verifyCalls.length=0;F.verifyResults=[{result:'owner',score:0.7,threshold:0.5}];
 let g=await run('flGuard()');
 ok(g.ok&&F.verifyCalls.length===1&&F.verifyCalls[0].grant===true,'guard: owner passes, camera ran');
 F.remainMs=0;F.verifyResults=[{result:'unknown',score:0.1,threshold:0.5}];
 g=await run('flGuard()');
 ok(!g.ok&&/Owner verify nahi hua/.test(g.text),'guard: unknown face refused');
 F.enrolled=0;F.verifyCalls.length=0;
 g=await run('flGuard()');
 ok(g.ok&&F.verifyCalls.length===0,'guard: nothing enrolled yet -> first enroll is free');F.enrolled=3;
 const W=(a,b)=>run('flWeaker(Object.assign({},flCfg(),'+JSON.stringify(a)+'),Object.assign({},flCfg(),'+JSON.stringify(b)+'))');
 ok(W({on:true},{on:false})&&W({areas:['screen','termux']},{areas:['screen']})&&W({min:5},{min:60})&&W({blink:true},{blink:false})&&W({lock:true},{lock:false})&&W({strict:0.05},{strict:0}),'weaker: off, area removed, longer window, blink/lock off, looser strictness');
 ok(!W({on:true},{on:true})&&!W({areas:['screen']},{areas:['screen','files']})&&!W({min:30},{min:5})&&!W({strict:0},{strict:0.1}),'not weaker: same, area added, shorter window, stricter');

 // 12d. Settings Save: weakening needs the owner, otherwise nothing is saved
 run("S.fl=undefined");run('sheet()');
 doc.querySelector('#fl_on').value='off';
 F.remainMs=0;F.verifyCalls.length=0;F.verifyResults=[{result:'unknown',score:0.1,threshold:0.5}];
 await els['#save'].onclick();
 ok(F.verifyCalls.length===1&&(!run('S.fl')||run('S.fl.on!==false')),'save: master off by unknown face -> refused, setting unchanged');
 F.remainMs=0;F.verifyResults=[{result:'owner',score:0.7,threshold:0.5}];
 await els['#save'].onclick();
 ok(run('S.fl&&S.fl.on===false'),'save: master off after owner check -> saved');
 run("S.fl=undefined");

 // 12e. unlock window chip: timer + Band karo
 F.remainMs=0;await run('flWinSync()');
 ok(doc.querySelector('#flwin').hidden===true,'chip: hidden when no window');
 F.remainMs=0;F.verifyResults=[{result:'owner',score:0.7,threshold:0.5}];
 await run("flVerify({grant:true})");await new Promise(r=>setTimeout(r,30));
 ok(doc.querySelector('#flwin').hidden===false&&/^\d+:\d\d$/.test(doc.querySelector('#flwt').textContent)&&doc.querySelector('#flwt').textContent.split(':')[0]>=29,'chip: shows ~30:00 after an owner check');
 ok(run("flFmt(65000)")==='1:05'&&run("flFmt(3725000)")==='1:02:05'&&run("flFmt(0)")==='0:00','chip: time format m:ss / h:mm:ss');
 F.clears=0;await doc.querySelector('#flwoff').onclick();await new Promise(r=>setTimeout(r,30));
 ok(F.clears===1&&F.remainMs===0&&doc.querySelector('#flwin').hidden===true,'Band karo: native window revoked, chip hidden');
 F.remainMs=0;F.verifyCalls.length=0;F.verifyResults=[{result:'owner',score:0.7,threshold:0.5}];
 x=await exec('screen_click',{id:21});
 ok(F.verifyCalls.length===1,'after Band karo the next gated tool asks for the face again');
 F.verifyResults=[{result:'owner',score:0.7,threshold:0.5}];F.remainMs=0;await run("flVerify({grant:false})");await new Promise(r=>setTimeout(r,30));
 ok(doc.querySelector('#flwin').hidden===true,'test verify (grant:false) does not show a window');
 F.remainMs=20*60000;F.clears=0;run('flBind&&0');run('sheet()');await doc.querySelector('#fl_off').onclick();
 ok(F.clears===1,'Settings: "Verify window abhi band karo" revokes the window');

 // 13. other files unchanged behaviour: system prompt still migrated, version
 ok(/^\d+\.\d{5}\.\d+$/.test(run('APP_VER')),'APP_VER '+run('APP_VER'));

 console.log('\n'+pass+' pass, '+fail+' fail');process.exit(fail?1:0);
})().catch(e=>{console.error('ERR',e);process.exit(1)});
