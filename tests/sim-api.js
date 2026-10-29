// Step15: auto Save/toggle through Accessibility (open_intent press/set, set_switch) and Termux:API (device_api, api_check).
const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){}},addEventListener(t,f){const k=sel+':'+t,pv=handlers[k];handlers[k]=pv?async e=>{await pv(e);await f(e)}:f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},focus(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){handlers[sel+':change']=f},scrollHeight:0,scrollTop:0,disabled:false,textContent:'',srcdoc:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}},addEventListener(){}};
const store={},sent=[],pills=[];let failWith=null,failPkgOnly=false;
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>ms>=100000?0:setTimeout(f,Math.min(ms,3)),clearTimeout,URL,Image:function(){},fetch:async()=>({ok:true,status:200,json:async()=>({choices:[{message:{role:'assistant',content:'ok'}}]}),text:async()=>''})};
ctx.window=ctx;
let screen=[],clicks=[],runs=[],runRes=null,flip=true,pkg='com.android.settings';
ctx.Capacitor={nativePromise:async(pl,m,o)=>{
  if(pl==='Intents'){sent.push(o);return{ok:true}}
  if(pl==='ScreenControl'){
    if(m==='pill'){pills.push(o);return{ok:true}}
    if(m==='activity')return{};
    if(m==='read')return{pkg,items:screen.map(x=>Object.assign({},x))};
    if(m==='click'){clicks.push(o.id);const it=screen.find(x=>x.i===o.id);if(it&&flip&&/Switch|Toggle/.test(it.k)){const on=(it.f||'').indexOf('x')>=0;it.f=on?(it.f||'').replace('x',''):(it.f||'')+'x'}if(it&&it.dismiss)screen=[];return{ok:true,label:it&&it.t}}
    return{ok:true}}
  if(pl==='Termux'&&m==='run'){runs.push(o);return typeof runRes==='function'?runRes(o):runRes||{exitCode:0,stdout:'',stderr:''}}
  return{}}};
vm.createContext(ctx);
process.chdir(__dirname+'/../www');
for(const f of ['prompts','core','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','intents','termuxapi','rules','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
const t=s=>vm.runInContext(s,ctx);
let fails=0;const ok=(c,l)=>{console.log((c?'PASS ':'FAIL ')+l);if(!c)fails++};
const run=async(name,a)=>{const steps=[];const res=await t('execTool')(name,a,steps);return{res:String(res),steps}};
const sw=(i,t_,on)=>({i,k:'Switch',t:t_,f:'c'+(on?'x':'')});
(async()=>{
 // ---- set_switch ----
 screen=[{i:0,k:'TextView',t:'Wi-Fi'},sw(1,'',false),{i:2,k:'TextView',t:'Bluetooth'},sw(3,'',true)];clicks.length=0;
 let r=await run('set_switch',{text:'Wi-Fi',state:'on'});
 ok(clicks.length===1&&clicks[0]===1&&/ab ON/.test(r.res),'set_switch taps the Wi-Fi switch and verifies ON');
 clicks.length=0;r=await run('set_switch',{text:'Wi-Fi',state:'on'});
 ok(clicks.length===0&&/pehle se ON/.test(r.res),'already ON: nothing tapped');
 clicks.length=0;r=await run('set_switch',{text:'Bluetooth',state:'off'});
 ok(clicks[0]===3&&/ab OFF/.test(r.res),'Bluetooth switch (next label) turned OFF');
 flip=false;clicks.length=0;r=await run('set_switch',{text:'Wi-Fi',state:'off'});
 ok(/state nahi badli/.test(r.res)&&!/ab OFF/.test(r.res),'tap that changes nothing is reported as failure, not success');flip=false;
 flip=true;screen=[{i:0,k:'TextView',t:'Hotspot'},sw(1,'',false)];
 r=await run('set_switch',{text:'Wi-Fi',state:'on',app:''});
 ok(/koi switch nahi mila/.test(r.res),'no switch near the label: refused, nothing tapped');
 screen=[sw(1,'',false),sw(2,'',false),{i:3,k:'TextView',t:'x'}];clicks.length=0;
 r=await run('set_switch',{text:'zzz',state:'on'});ok(clicks.length===0,'many switches and unknown label: nothing tapped');
 // ---- open_intent set ----
 screen=[{i:0,k:'TextView',t:'Wi-Fi'},sw(1,'',false)];sent.length=0;clicks.length=0;
 r=await run('open_intent',{name:'wifi_panel',params:{set:'on'}});
 ok(sent.length===1&&sent[0].action==='android.settings.panel.action.WIFI'&&clicks[0]===1&&/ab ON/.test(r.res)&&/Intent bheja/.test(r.res),'wifi_panel set:on opens panel, taps, verifies');
 sent.length=0;r=await run('open_intent',{name:'battery_usage',params:{set:'on'}});
 ok(sent.length===0&&/switch set nahi hota/.test(r.res),'set on a page without switch: refused before sending');
 sent.length=0;r=await run('open_intent',{name:'wifi_panel',params:{set:'maybe'}});ok(sent.length===0&&/on.*off/.test(r.res),'bad set value refused before sending');
 // ---- open_intent press ----
 screen=[{i:0,k:'EditText',t:'Title'},{i:1,k:'Button',t:'Save',f:'c',dismiss:true}];sent.length=0;clicks.length=0;
 r=await run('open_intent',{name:'calendar_event_add',params:{title:'Meeting',start:'2026-11-02 17:00'}});
 ok(sent.length===1&&clicks[0]===1&&/"Save" dabaya, form band ho gaya/.test(r.res)&&/verify nahi kiya/.test(r.res),'calendar_event_add taps Save by itself and says what it could not verify');
 screen=[{i:1,k:'Button',t:'Save',f:'c'}];clicks.length=0;
 r=await run('open_intent',{name:'contact_add',params:{name:'Rahul'}});
 ok(clicks[0]===1&&/abhi bhi khula/.test(r.res),'form still open after Save: reported honestly');
 clicks.length=0;sent.length=0;r=await run('open_intent',{name:'calendar_event_add',params:{title:'x',start:'2026-11-02 17:00',press:false}});
 ok(sent.length===1&&clicks.length===0,'press:false only opens the form');
 screen=[{i:0,k:'TextView',t:'Nothing here'}];r=await run('open_intent',{name:'contact_add',params:{name:'Rahul'}});
 ok(/button 10s me nahi dikha, kuch dabaya nahi/.test(r.res),'Save button missing: honest failure');
 sent.length=0;r=await run('open_intent',{name:'email_compose',params:{to:'a@b.com'}});ok(sent.length===1&&!/dabaya/.test(r.res),'email_compose never auto-presses');
 sent.length=0;r=await run('open_intent',{name:'email_compose',params:{to:'a@b.com',press:'Pay now'}});ok(sent.length===0&&/allowed nahi/.test(r.res),'press: payment button refused before sending');
 sent.length=0;r=await run('open_intent',{name:'email_compose',params:{to:'a@b.com',press:'Delete'}});ok(sent.length===0,'press: delete refused');
 // flow step
 screen=[{i:0,k:'TextView',t:'Bluetooth'},sw(1,'',false)];clicks.length=0;
 r=await run('run_flow',{steps:[{do:'toggle',text:'Bluetooth',state:'on'}]});ok(clicks[0]===1&&/Bluetooth ab ON/.test(r.res)&&/Final screen/.test(r.res),'run_flow toggle step works and returns the final screen');
 // ---- device_api ----
 runs.length=0;runRes={exitCode:0,stdout:'{"percentage":63,"status":"DISCHARGING"}',stderr:''};
 r=await run('device_api',{name:'battery'});ok(/63/.test(r.res)&&runs[0].command.indexOf('termux-battery-status')>=0&&/^timeout \d+ sh -c /.test(runs[0].command),'battery: runs fixed command under timeout, returns real output');
 runs.length=0;r=await run('device_api',{name:'clipboard_set',params:{text:"it's $(rm -rf /) ; x"}});
 ok(runs[0].command.indexOf("termux-clipboard-set")>=0&&runs[0].command.indexOf("'\\''")>=0,'text param is quoted (no shell injection)');
 runs.length=0;r=await run('device_api',{name:'torch',params:{state:'x'}});ok(runs.length===0&&/state/.test(r.res),'bad torch state refused, nothing run');
 runs.length=0;r=await run('device_api',{name:'volume_set',params:{stream:'music;rm',level:3}});ok(runs.length===0,'bad stream refused');
 runs.length=0;r=await run('device_api',{name:'brightness',params:{level:999}});ok(runs.length===0,'brightness 999 refused');
 runs.length=0;r=await run('device_api',{name:'media_scan',params:{path:'/data/x'}});ok(runs.length===0,'media_scan outside /sdcard refused');
 runs.length=0;r=await run('device_api',{name:'rm_everything'});ok(runs.length===0&&/nahi mila/.test(r.res),'unknown name refused');
 ok(!Object.keys(t('API')).some(k=>/sms|call|contact|finger/i.test(k)),'no sms / call / contact / fingerprint in the list');
 // errors
 runRes={exitCode:127,stdout:'',stderr:'sh: termux-battery-status: not found'};r=await run('device_api',{name:'battery'});ok(/pkg install termux-api/.test(r.res)&&!/ho gaya/i.test(r.res),'missing package: exact next step');
 runRes={exitCode:124,stdout:'',stderr:''};r=await run('device_api',{name:'battery'});ok(/Termux:API app/.test(r.res),'timeout (exit 124): says the Termux:API app is missing or has no permission');
 runRes={exitCode:0,stdout:'',stderr:'',timeout:true};r=await run('device_api',{name:'location'});ok(/Termux timeout/.test(r.res),'app-level timeout reported');
 // camera: confirm card first, cancel = nothing run
 runs.length=0;runRes={exitCode:0,stdout:'-rw 1 x',stderr:''};
 const p=run('device_api',{name:'camera_photo',params:{camera:'front',name:'Me Pic!'}});
 await new Promise(r2=>setTimeout(r2,30));
 const card=t('H').find(x=>x.confirm&&x.confirm.type==='termux'&&x.confirm.state==='pending');
 ok(!!card&&runs.length===0,'camera_photo shows a confirm card and runs nothing yet');
 t('TCONF')[card.confirm.id](false);r=await p;
 ok(/cancel/i.test(r.res)&&runs.length===0,'cancel: camera never ran');
 const p2=run('device_api',{name:'mic_record',params:{seconds:5}});await new Promise(r2=>setTimeout(r2,30));
 const card2=t('H').filter(x=>x.confirm&&x.confirm.state==='pending').pop();t('TCONF')[card2.confirm.id](true);r=await p2;
 ok(runs.length===1&&/termux-microphone-record/.test(runs[0].command)&&/work\/api\/api-\d+\.m4a/.test(r.res),'mic_record runs after confirm, file under work/api');
 // api_check
 runRes={exitCode:0,stdout:'OK\n',stderr:''};r=await run('api_check',{});ok(/chal raha hai/.test(r.res),'api_check OK');
 runRes={exitCode:0,stdout:'NOPKG\n',stderr:''};r=await run('api_check',{});ok(/pkg install termux-api/.test(r.res),'api_check: package missing');
 runRes={exitCode:0,stdout:'NOAPP\n',stderr:''};r=await run('api_check',{});ok(/Termux:API app/.test(r.res),'api_check: app missing');
 // rules / log / skill
 ok(t("ruleAreas('battery kitni hai')").includes('api')&&t("ruleAreas('clipboard me kya hai')").includes('api'),'api rules auto-inject on battery / clipboard');
 const rt=t('ruleText')('api');ok(rt.includes('battery')&&rt.includes('api_check')&&rt.includes('confirm card'),'rules api text');
 ok(t('RULE_ORDER').includes('api')&&t('skillText()').includes('device_api(')&&t('skillText()').includes('set_switch('),'skill lists device_api and set_switch');
 ok(!/Termux:API are not|not set up yet: Termux:API/i.test(t('S.system')),'prompt no longer says Termux:API is missing');
 ok(/press|set_switch/.test(t('S.system'))&&/never ask Najeef to tap/i.test(t('S.system')),'prompt tells Chaman to press things itself');
 ok(/never ask Najeef to press Save/i.test(t("ruleText('intents')")),'intents rules say: never ask him to press Save or a toggle');
 ok(t("logTool('device_api',{name:'clipboard_set',params:{text:'SECRET'}})").indexOf('SECRET')<0,'log has no private values');
 ok(t('PREV16_SYS').length>1000&&t('DEF_SYS')!==t('PREV16_SYS'),'previous prompt kept for migration');
 console.log(fails?fails+' FAILED':'ALL PASS');process.exit(fails?1:0);
})().catch(e=>{console.log('CRASH',e);process.exit(1)});
