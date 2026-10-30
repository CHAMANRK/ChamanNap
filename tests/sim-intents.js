// Step14: open_intent catalog. Every entry builds and passes the whitelist, the JS and Java lists agree, bad params are refused, results are honest.
const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){}},addEventListener(t,f){const k=sel+':'+t,pv=handlers[k];handlers[k]=pv?async e=>{await pv(e);await f(e)}:f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},focus(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){handlers[sel+':change']=f},scrollHeight:0,scrollTop:0,disabled:false,textContent:'',srcdoc:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}},addEventListener(){}};
const store={},sent=[],pills=[];let failWith=null,failPkgOnly=false;
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,3)),clearTimeout,URL,Image:function(){},fetch:async()=>({ok:true,status:200,json:async()=>({choices:[{message:{role:'assistant',content:'ok'}}]}),text:async()=>''})};
ctx.window=ctx;
ctx.Capacitor={nativePromise:async(pl,m,o)=>{
  if(pl==='Intents'){sent.push(o);if(failWith&&!(failPkgOnly&&!o.pkg))return Promise.reject(Object.assign(new Error('x'),{code:failWith}));return{ok:true}}
  if(pl==='ScreenControl'&&m==='pill'){pills.push(o);return{ok:true}}
  return{}}};
vm.createContext(ctx);
process.chdir(__dirname+'/../www');
for(const f of ['prompts','core','status','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','intents','termuxapi','runner','rules','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
const t=s=>vm.runInContext(s,ctx);
let fails=0;const ok=(c,l)=>{console.log((c?'PASS ':'FAIL ')+l);if(!c)fails++};
const run=async(name,a)=>{const steps=[];const res=await t('execTool')(name,a,steps);return{res:String(res),steps}};
const SAMPLE={alarm_set:{hour:6,minutes:30,label:'gym',days:'mon,wed'},timer_set:{seconds:300},calendar_day:{date:'2026-11-02'},calendar_event_add:{title:'Meeting',start:'2026-11-02 17:00'},contact_add:{name:'Rahul',phone:'+919999999999'},email_compose:{to:'a@b.com',subject:'Hi there',body:'Line 1\nLine 2'},music_play:{query:'arijit singh'},maps_search:{query:'petrol pump'},navigate:{destination:'Delhi airport'},web_search:{query:'weather'},share_text:{text:'hello'},playstore_app:{package:'com.whatsapp'},playstore_search:{query:'torch'},app_info:{package:'com.whatsapp'},app_notification_settings:{package:'com.whatsapp'}};
(async()=>{
 const names=t('Object.keys(IN)');
 // 1. every catalog entry builds and passes the check
 let bad=[];
 for(const n of names){try{t('intentSpec')(n,SAMPLE[n]||{})}catch(e){bad.push(n+': '+e.message)}}
 ok(bad.length===0,names.length+' catalog entries build and pass the whitelist'+(bad.length?' - '+bad.join('; '):''));
 ok(names.length>=60,'catalog is long ('+names.length+')');
 // 2. JS and Java lists agree
 const J=fs.readFileSync(__dirname+'/../native/IntentsPlugin.java','utf8');
 const jset=n=>{const m=J.match(new RegExp('static final Set<String> '+n+' = new HashSet<>\\(Arrays\\.asList\\(([\\s\\S]*?)\\)\\);'));return m?Array.from(m[1].matchAll(/"([^"]+)"/g)).map(x=>x[1]).sort():null};
 const jsset=k=>Array.from(t('INT_OK.'+k)).sort();
 const eq=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>x===b[i]);
 ok(eq(jset('ACTIONS'),jsset('actions')),'actions: Java list == JS list ('+(jset('ACTIONS')||[]).length+')');
 ok(eq(jset('CATEGORIES'),jsset('cats')),'categories agree');
 ok(eq(jset('SCHEMES'),jsset('schemes')),'data schemes agree');
 ok(eq(jset('TYPES'),jsset('types')),'types agree');
 ok(eq(jset('KEYS'),jsset('keys')),'extra keys agree');
 ok(eq(jset('CONTENT_PREFIXES'),t('INT_OK.contentPrefix').slice().sort()),'content prefixes agree');
 // 3. specs
 const S=(n,p)=>t('intentSpec')(n,p);
 let sp=S('alarm_set',{hour:6,minutes:30,label:'gym',days:'mon,wed'});
 ok(sp.action==='android.intent.action.SET_ALARM'&&sp.extras['android.intent.extra.alarm.HOUR']===6&&sp.extras['android.intent.extra.alarm.MINUTES']===30&&sp.extras['android.intent.extra.alarm.MESSAGE']==='gym'&&JSON.stringify(sp.extras['android.intent.extra.alarm.DAYS'])==='[2,4]'&&sp.extras['android.intent.extra.alarm.SKIP_UI']===true,'alarm_set: hour/min/label/days (mon,wed=2,4)/skip_ui');
 ok(S('alarm_set',{hour:7,skip_ui:false}).extras['android.intent.extra.alarm.SKIP_UI']===false,'alarm_set skip_ui=false respected');
 sp=S('calendar_event_add',{title:'Meeting',start:'2026-11-02 17:00',location:'Office'});
 ok(sp.extras.beginTime===new Date(2026,10,2,17,0).getTime()&&sp.extras.endTime===sp.extras.beginTime+3600000&&sp.extras.eventLocation==='Office'&&sp.data==='content://com.android.calendar/events','calendar_event_add: local time -> ms, default 1h, location');
 sp=S('calendar_event_add',{title:'Eid',start:'2026-11-02',all_day:true});ok(sp.extras.allDay===true&&sp.extras.endTime-sp.extras.beginTime===86400000,'all-day event');
 sp=S('email_compose',{to:'a@b.com',subject:'Hi there',body:'Line 1\nLine 2'});ok(sp.data==='mailto:a@b.com?subject=Hi%20there&body=Line%201%0ALine%202','email_compose: mailto with encoded subject/body ('+sp.data+')');
 sp=S('navigate',{destination:'Delhi airport',mode:'w'});ok(sp.data==='google.navigation:q=Delhi%20airport&mode=w','navigate url');
 ok(S('share_text',{text:'hello'}).chooser===true,'share_text uses the chooser');
 ok(S('wifi_panel').action==='android.settings.panel.action.WIFI'&&S('calculator_open').category==='android.intent.category.APP_CALCULATOR','panel and category entries');
 ok(S('app_info',{package:'com.whatsapp'}).data==='package:com.whatsapp','app_info -> package: uri');
 // 4. bad params / names refused
 const thr=(n,p)=>{try{S(n,p);return null}catch(e){return e.message}};
 ok(/0 se 23/.test(thr('alarm_set',{hour:25})),'hour 25 refused');
 ok(/hour/.test(thr('alarm_set',{})),'missing hour refused');
 ok(/package/.test(thr('app_info',{package:'whatsapp; rm -rf'})),'bad package name refused');
 ok(/title/.test(thr('calendar_event_add',{start:'2026-11-02 10:00'}))&&/format/.test(thr('calendar_event_add',{title:'x',start:'kal subah'})),'event needs title and a real time');
 ok(/nahi hai/.test(thr('call_someone',{})),'unknown intent name refused');
 // 5. nothing dangerous in the lists
 const acts=t('Array.from(INT_OK.actions)');ok(!acts.some(a=>/\.CALL($|_)|SENDTO_SMS|DELETE|INSTALL|UNINSTALL|CALL_PRIVILEGED|ACTION_CALL/.test(a)),'no call / delete / install action in the whitelist');
 ok(!t('Array.from(INT_OK.schemes)').includes('file')&&!t('Array.from(INT_OK.schemes)').includes('javascript')&&!t('Array.from(INT_OK.schemes)').includes('intent'),'no file / javascript / intent scheme');
 // 6. tool path
 let r=await run('open_intent',{name:'alarm_set',params:{hour:6,minutes:30,label:'gym'}});
 ok(sent.length===1&&sent[0].action==='android.intent.action.SET_ALARM'&&sent[0].extras['android.intent.extra.alarm.HOUR']===6,'tool sends the intent to the native plugin');
 ok(/Intent bheja: alarm_set/.test(r.res)&&/confirm nahi kar sakti/.test(r.res),'result is honest: sent, not confirmed ('+r.res.slice(0,90)+')');
 r=await run('open_intent',{name:'wifi_panel'});ok(/Page\/app khul gaya/.test(r.res)&&sent[1].action==='android.settings.panel.action.WIFI','settings panel opens');
 r=await run('open_intent',{name:'alarm_set',params:{hour:99}});ok(/Fail/.test(r.res)&&sent.length===2,'bad param: nothing is sent to the phone');
 failWith='NOT_FOUND';r=await run('open_intent',{name:'calculator_open'});ok(/app nahi mila/.test(r.res)&&/open_app/.test(r.res),'no app found: tells the AI to try open_app');
 failWith='NOT_FOUND';failPkgOnly=true;const before=sent.length;r=await run('open_intent',{name:'alarms_show',app:'com.nope'});ok(sent.length===before+2&&!sent[sent.length-1].pkg&&/Intent bheja/.test(r.res),'forced package missing: retried without package');
 failWith=null;failPkgOnly=false;
 r=await run('run_flow',{steps:[{do:'open_intent',name:'timer_set',params:{seconds:60}},{do:'wait',seconds:1},{do:'open_intent',name:'timers_show'}]});
 ok(/Flow poora \(3 steps\)/.test(r.res)&&sent.filter(x=>x.action==='android.intent.action.SET_TIMER').length===1,'run_flow accepts open_intent steps');
 ok(t('LEFT_APP')===true,'open_intent counts as leaving the app (Chaman comes back at the end)');
 // 7. log, rules, tool schema
 const lg=t("logTool('open_intent',{name:'email_compose',params:{to:'a@b.com',body:'SECRET TEXT'}})");ok(lg.indexOf('SECRET')<0&&lg.indexOf('a@b.com')<0&&lg.includes('email_compose'),'log keeps the name and param keys, not the values');
 ok(t("ruleAreas('subah 6 baje ka alarm laga do')").includes('intents')&&t("ruleAreas('wifi on kar do')").includes('intents'),'intents rules auto-inject on alarm / wifi words');
 const rt=t('ruleText')('intents');ok(rt.includes('alarm_set(')&&rt.includes('wifi_settings')&&rt.length<3000,'rules_read intents lists names with params ('+rt.length+' chars)');
 const sch=t("TOOLS.find(x=>x.function.name==='open_intent').function.parameters.properties.name.enum");ok(sch.length===names.length&&sch.includes('alarm_set'),'tool name enum has every catalog name');
 ok(t('skillText()').includes('- open_intent('),'skill lists open_intent');
 console.log(fails?'\n'+fails+' FAILED':'\nALL PASS');process.exit(fails?1:0);
})().catch(e=>{console.error('ERR',e);process.exit(1)});
