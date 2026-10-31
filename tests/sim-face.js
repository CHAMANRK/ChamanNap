// step20: face lock. Run: cd www && node ../tests/sim-face.js
const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',checked:false,style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){},contains(){return false}},addEventListener(t,f){handlers[sel+':'+t]=f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},textContent:''};
 let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}},addEventListener(){},hidden:false};
const store={};
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('PASS',m)}else{fail++;console.log('FAIL',m)}};
// ---- fake FaceLock plugin ----
const F={enrolled:3,modelOk:true,remainMs:0,verifyResults:[],verifyCalls:[],cfg:null,progress:{active:false,text:'',state:'run'},missing:false,camera:true};
const native=[],lines=[];
const faceNative=async(m,o)=>{
 if(F.missing){const e=new Error('plugin missing');throw e}
 if(m==='status')return{modelOk:F.modelOk,enrolled:F.enrolled,camera:F.camera,remainMs:F.remainMs,active:F.modelOk&&F.enrolled>0,a11y:true,lastUnknownAt:0};
 if(m==='config'){F.cfg=o;return{ok:true}}
 if(m==='progress')return F.progress;
 if(m==='verify'){
  F.verifyCalls.push(o);
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
 F.missing=true;x=await exec('screen_click',{id:7});
 ok(/Click/.test(x.r),'plugin missing (browser): no gate, tool runs');
 F.missing=false;

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

 // 13. other files unchanged behaviour: system prompt still migrated, version
 ok(/^19\.\d+\.\d+$/.test(run('APP_VER')),'APP_VER '+run('APP_VER'));

 console.log('\n'+pass+' pass, '+fail+' fail');process.exit(fail?1:0);
})().catch(e=>{console.error('ERR',e);process.exit(1)});
