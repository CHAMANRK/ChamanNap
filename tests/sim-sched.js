// Step22: Chaman's own notifications + scheduler (sched.js + Notify plugin). Tools, /remind, rules area, time maths, honest results, and checks that the Java side and the patch script match the JS.
const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){}},addEventListener(t,f){const k=sel+':'+t,pv=handlers[k];handlers[k]=pv?async e=>{await pv(e);await f(e)}:f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},focus(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){handlers[sel+':change']=f},scrollHeight:0,scrollTop:0,disabled:false,textContent:'',srcdoc:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}},addEventListener(){}};
const store={},sent=[],pills=[];let failWith=null,failPkgOnly=false;
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,3)),clearTimeout,URL,Image:function(){},fetch:async()=>({ok:true,status:200,json:async()=>({choices:[{message:{role:'assistant',content:'ok'}}]}),text:async()=>''})};
ctx.window=ctx;
// Native Notify mock: keeps schedules like NotifyPlugin does
const NY={list:[],hist:[],calls:[],status:{notif:true,exact:true,battery:true,count:0,mode:'clock',wake:true,sdk:34},shown:[],showOk:true,addErr:null,briefs:[],ai:[]};
ctx.Capacitor={nativePromise:async(pl,m,o)=>{
  if(pl==='Notify'){
    NY.calls.push(m);
    if(m==='setAi'){if(NY.aiFail)return Promise.reject(new Error('x'));NY.ai=o.providers;NY.aiSets=(NY.aiSets||0)+1;return{providers:o.providers.length}}
    if(m==='takeBriefs'){return{items:NY.briefs.splice(0)}}
    if(m==='status')return Object.assign({},NY.status,{count:NY.list.length,aiProviders:(NY.ai||[]).length,aiKeys:(NY.ai||[]).reduce((n,p)=>n+p.keys.length,0)});
    if(m==='setMode'){NY.status.mode=o.mode;return Object.assign({},NY.status)}
    if(m==='setWake'){NY.status.wake=!!o.on;return Object.assign({},NY.status)}
    if(m==='rearm')return Object.assign({},NY.status);
    if(m==='show'){NY.shown.push(o);return{shown:NY.showOk}}
    if(m==='add'){
      if(NY.addErr)return Promise.reject(Object.assign(new Error(NY.addErr.message),{code:NY.addErr.code}));
      const at=o.rep==='none'?o.at:o.at;NY.list=NY.list.filter(x=>x.id!==o.id);NY.list.push({id:o.id,title:o.title,text:o.text,ch:o.channel,rep:o.rep,at,h:o.h,m:o.m,kind:o.kind||undefined,prompt:o.prompt||undefined});
      NY.lastAdd=o;const via=NY.status.mode==='clock'?'clock':(NY.status.exact?'exact':'inexact');return{id:o.id,at,exact:via!=='inexact',via}}
    if(m==='list')return{items:NY.list.slice(),hist:NY.hist};
    if(m==='cancel'){const n=NY.list.length;NY.list=NY.list.filter(x=>x.id!==o.id);return{removed:NY.list.length<n}}
    if(m==='clear'){const n=NY.list.length;NY.list=[];return{cleared:n}}
    return{};
  }
  return{}}};
vm.createContext(ctx);
process.chdir(__dirname+'/../www');
for(const f of ['version','prompts','core','status','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','intents','termuxapi','runner','sched','rules','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
const t=s=>vm.runInContext(s,ctx);
let fails=0;const ok=(c,l)=>{console.log((c?'PASS ':'FAIL ')+l);if(!c)fails++};
const run=async(name,a)=>{const steps=[];const res=await t('execTool')(name,a,steps);return{res:String(res),steps}};
const L=(y,mo,d,h,mi,s)=>new Date(y,mo-1,d,h,mi||0,s||0,0).getTime();
const fmt=ms=>t('schFmt')(ms);
const lastMsg=()=>t('H')[t('H').length-1];
(async()=>{
 // ---- 1. tools exist and are well formed
 const names=t('TOOLS.map(x=>x.function.name)');
 ['notify_now','schedule_add','schedule_list','schedule_cancel'].forEach(n=>ok(names.includes(n),'tool registered: '+n));
 ok(t('TOOLS.find(x=>x.function.name==="schedule_add").function.parameters.required.length')===0,'schedule_add has no always-required field (in_minutes or time)');
 ok(t('TOOLS.find(x=>x.function.name==="schedule_cancel").function.parameters.required.join()')==='id','schedule_cancel needs id');
 ok(!names.includes('schedule_clear'),'AI has no tool to wipe every schedule (only /remind clear)');
 ok(/schedule_add/.test(t('skillText()')),'skill lists schedule_add');

 // ---- 2. next fire time (same rule as NotifyCore.nextFire)
 const N=t('schNext');
 const sun6=L(2026,11,1,6,0);
 ok(N('daily',7,30,sun6)===L(2026,11,1,7,30),'daily 07:30 at 06:00 -> today');
 ok(N('daily',7,30,L(2026,11,1,8,0))===L(2026,11,2,7,30),'daily 07:30 at 08:00 -> tomorrow');
 ok(N('daily',7,30,L(2026,11,1,7,30))===L(2026,11,2,7,30),'exactly at the time -> next day (no double fire)');
 ok(N('weekdays',9,0,sun6)===L(2026,11,2,9,0),'weekdays from Sunday -> Monday');
 ok(N('weekdays',9,0,L(2026,11,6,10,0))===L(2026,11,9,9,0),'weekdays Friday after 09:00 -> Monday');
 ok(N('weekdays',9,0,L(2026,11,3,8,0))===L(2026,11,3,9,0),'weekdays Tuesday before 09:00 -> same day');
 ok(N('none',23,59,L(2026,11,30,23,59))===L(2026,12,1,23,59),'month end rolls over');

 // ---- 3. resolve tool args
 const R=(a,now)=>t('schResolve')(a,now||sun6);
 let r=R({text:'chai',in_minutes:10});
 ok(!r.err&&r.at===sun6+600000&&r.rep==='none'&&r.channel==='remind'&&r.title==='Chaman','in_minutes 10 -> now+10 min, defaults ok');
 ok(R({text:'x',in_minutes:0}).err&&R({text:'x',in_minutes:50000}).err&&R({text:'x',in_minutes:'abc'}).err,'in_minutes out of range or not a number is refused');
 ok(R({text:'x',in_minutes:5,repeat:'daily'}).err,'in_minutes with repeat is refused');
 r=R({text:'uth',time:'7:30'});ok(!r.err&&r.at===L(2026,11,1,7,30)&&r.h===7&&r.m===30,'time 7:30 at 06:00 -> today 07:30');
 r=R({text:'uth',time:'05:30'});ok(!r.err&&r.at===L(2026,11,2,5,30),'time already passed, no date -> tomorrow');
 r=R({text:'uth',time:'07:30',date:'tomorrow'});ok(!r.err&&r.at===L(2026,11,2,7,30),'date tomorrow');
 r=R({text:'uth',time:'07:30',date:'kal'});ok(!r.err&&r.at===L(2026,11,2,7,30),'date kal');
 r=R({text:'uth',time:'05:30',date:'today'});ok(r.err&&/nikal chuka/.test(r.err),'today + time already passed is refused');
 r=R({text:'uth',time:'18:00',date:'2026-11-05'});ok(!r.err&&r.at===L(2026,11,5,18,0),'date YYYY-MM-DD');
 ok(R({text:'x',time:'18:00',date:'2026-02-31'}).err&&R({text:'x',time:'18:00',date:'2026-13-01'}).err&&R({text:'x',time:'18:00',date:'parso'}).err,'bad dates refused');
 ok(R({text:'x',time:'18:00',date:'2028-01-01'}).err,'more than a year ahead refused');
 ok(R({text:'x',time:'24:00'}).err&&R({text:'x',time:'12:60'}).err&&R({text:'x',time:'abc'}).err&&R({text:'x'}).err,'bad or missing time refused');
 r=R({text:'gm',time:'07:30',repeat:'daily',date:'2026-12-25'});ok(!r.err&&r.rep==='daily'&&r.at===L(2026,11,1,7,30),'repeat ignores date, starts at the next 07:30');
 r=R({text:'sd',time:'09:00',repeat:'weekdays'});ok(!r.err&&r.at===L(2026,11,2,9,0),'weekdays starts Monday from Sunday');
 ok(R({text:'x',time:'09:00',repeat:'monthly'}).err,'unknown repeat refused');
 ok(R({}).err&&R({title:'  ',text:'',time:'09:00'}).err,'no title and no text refused');
 r=R({title:'a'.repeat(200),text:'line1\nline2   line3'.repeat(40),time:'09:00'});ok(r.title.length===80&&r.text.length<=300&&!/\n/.test(r.text),'title 80 / text 300 chars, newlines removed');
 r=R({text:'x',time:'09:00',channel:'evil'});ok(r.channel==='remind','unknown channel falls back to remind');

 // ---- 4. tools against the native mock
 NY.list=[];NY.calls.length=0;
 let x=await run('schedule_add',{title:'Chai',text:'chai ready hai',in_minutes:10});
 ok(/Schedule ho gaya: id r[0-9a-z]+/.test(x.res)&&/ek baar/.test(x.res)&&/AI nahi chalega/.test(x.res),'schedule_add reports id, time, and that the AI does not run then');
 ok(NY.lastAdd&&NY.lastAdd.channel==='chaman_remind'&&NY.lastAdd.rep==='none'&&NY.lastAdd.title==='Chai','native add got channel id chaman_remind, rep none, title');
 ok(NY.list.length===1,'one schedule stored');
 x=await run('schedule_add',{title:'GM',text:'good morning',time:'07:30',repeat:'daily',channel:'report'});
 ok(NY.lastAdd.channel==='chaman_report'&&NY.lastAdd.rep==='daily'&&NY.lastAdd.h===7&&NY.lastAdd.m===30,'daily report: channel, h and m sent');
 NY.status.notif=false;NY.status.exact=false;NY.status.mode='quiet';
 x=await run('schedule_add',{text:'x',in_minutes:5});
 ok(/band hain/.test(x.res)&&/Exact alarm/.test(x.res),'warns when notifications are off and (quiet mode) exact alarm is missing');
 NY.status.mode='clock';
 x=await run('schedule_add',{text:'x',in_minutes:5});
 ok(/band hain/.test(x.res)&&!/Exact alarm/.test(x.res),'clock mode needs no exact alarm permission: no exact warning');
 NY.status.notif=true;NY.status.exact=true;
 x=await run('schedule_add',{text:'x',in_minutes:0});
 ok(/in_minutes/.test(x.res)&&!NY.calls.slice(-1).includes('add'),'bad args are refused before the native call');
 NY.addErr={code:'PAST',message:'x'};x=await run('schedule_add',{text:'x',in_minutes:5});ok(/nikal chuka/.test(x.res),'native PAST becomes a clear message');
 NY.addErr={code:'LIMIT',message:'Maximum 50 schedules ho chuke. Kuch cancel karo.'};x=await run('schedule_add',{text:'x',in_minutes:5});ok(/Maximum 50/.test(x.res),'native LIMIT message is shown');
 NY.addErr=null;
 x=await run('schedule_list',{});
 ok(/hain\./.test(x.res)&&/Chai/.test(x.res)&&/roz/.test(x.res),'schedule_list shows both');
 const firstId=NY.list[0].id;
 x=await run('schedule_cancel',{id:firstId});ok(/cancel kiya/.test(x.res)&&NY.list.every(z=>z.id!==firstId),'schedule_cancel removes it');
 x=await run('schedule_cancel',{id:'nope'});ok(/nahi mila/.test(x.res),'unknown id is reported');
 x=await run('schedule_cancel',{});ok(/id chahiye/.test(x.res),'cancel without id refused');
 NY.list=[];x=await run('schedule_list',{});ok(/Koi schedule nahi/.test(x.res),'empty list is said plainly');

 // notify_now: 3 per minute, honest when Android hides it
 NY.shown.length=0;
 for(let i=0;i<3;i++)x=await run('notify_now',{title:'T',text:'n'+i});
 ok(NY.shown.length===3&&/bheji/.test(x.res)&&NY.shown[0].channel==='chaman_remind','3 notify_now go out');
 x=await run('notify_now',{text:'4th'});ok(NY.shown.length===3&&/3 se zyada/.test(x.res),'4th within a minute is refused');
 t('SCH_NOW_T=[]');NY.showOk=false;x=await run('notify_now',{text:'hidden'});ok(/band hain/.test(x.res),'shown:false -> says notifications are off, no false success');NY.showOk=true;
 t('SCH_NOW_T=[]');x=await run('notify_now',{});ok(/title ya text/.test(x.res),'notify_now needs text');

 // ---- 5. log keeps no reminder text
 const lg=t('logTool("schedule_add",{title:"Secret title",text:"Secret body",time:"07:30",repeat:"daily"})');
 ok(!/Secret/.test(lg)&&/chars/.test(lg),'log line for schedule_add has no title or text');
 ok(!/Secret/.test(t('logTool("notify_now",{title:"Secret title",text:"Secret body"})')),'log line for notify_now has no text');
 ok(/schedule_list/.test(fs.readFileSync('js/tools.js','utf8').match(/logAdd\(fl\.bad[^\n]*/)[0]),'execTool does not log the schedule_list result (it has titles)');

 // ---- 6. /remind
 ok(t('SLASH.some(c=>c.name==="remind")'),'/remind is in the slash list');
 const P=a=>t('schParseCmd')(a,sun6);
 let p=P('10m chai ready');ok(p&&p.a.in_minutes===10&&p.a.text==='chai ready','10m');
 p=P('2h call karna');ok(p&&p.a.in_minutes===120,'2h = 120 min');
 p=P('2 ghante call');ok(p&&p.a.in_minutes===120,'ghante');
 p=P('07:30 uthna');ok(p&&p.a.time==='07:30'&&p.a.text==='uthna'&&!p.a.date,'HH:MM');
 p=P('kal 18:00 meeting');ok(p&&p.a.date==='kal'&&p.a.time==='18:00','kal');
 p=P('roz 07:30 good morning');ok(p&&p.a.repeat==='daily'&&p.a.text==='good morning','roz');
 p=P('weekdays 9 standup');ok(p&&p.a.repeat==='weekdays'&&p.a.time==='9','weekdays');
 ok(P('chai bana do')===null,'no time -> null');
 NY.list=[];t('H.length=0');
 await t('remindCmd')('10m chai ready');ok(/Reminder set/.test(lastMsg().content)&&NY.list.length===1&&NY.lastAdd.text==='chai ready','/remind 10m sets it');
 await t('remindCmd')('roz 07:30 good morning');ok(NY.list.length===2,'/remind roz');
 await t('remindCmd')('list');ok(/1\. /.test(lastMsg().content)&&/2\. /.test(lastMsg().content)&&/\/remind del/.test(lastMsg().content),'/remind list numbered');
 await t('remindCmd')('del 1');ok(/Hata diya/.test(lastMsg().content)&&NY.list.length===1,'/remind del 1');
 await t('remindCmd')('del 9');ok(/nahi mila/.test(lastMsg().content),'/remind del bad number');
 await t('remindCmd')('chai bana do');ok(/Samajh nahi aaya/.test(lastMsg().content),'unknown -> help');
 await t('remindCmd')('10m');ok(/text bhi likho/.test(lastMsg().content),'no text -> asks for text');
 await t('remindCmd')('2026-01-01 10:00 x');ok(/Samajh nahi/.test(lastMsg().content),'unsupported format -> help');
 await t('remindCmd')('test');ok(/1 minute me aayegi/.test(lastMsg().content)&&NY.list.some(z=>z.title==='Chaman test'),'/remind test');
 await t('remindCmd')('clear');ok(/schedule hata diye/.test(lastMsg().content)&&NY.list.length===0,'/remind clear');
 await t('remindCmd')('');ok(/Reminder \(Chaman ki apni notification\)/.test(lastMsg().content),'/remind alone shows help');
 NY.addErr={code:'LIMIT',message:'Maximum 50 schedules ho chuke. Kuch cancel karo.'};await t('remindCmd')('5m x');ok(/Maximum 50/.test(lastMsg().content),'/remind shows native limit');NY.addErr=null;

 // ---- 7. rules area
 const ar=t('ruleAreas')('kal subah 7 baje yaad dila dena');
 ok(ar.includes('remind')&&ar.length<=3,'rules auto-inject: "yaad dila" -> remind ('+ar.join()+')');
 ok(t('ruleAreas')('roz subah good morning notification bhejna').includes('remind'),'rules auto-inject: daily good morning');
 const rt=t('ruleText')('remind');
 ok(/schedule_add/.test(rt)&&/alarm_set/.test(rt)&&/does NOT run/.test(rt)&&/schedule_cancel/.test(rt)&&/\/remind/.test(rt),'remind rules mention tools, alarm_set difference, no AI at fire time, /remind');
 ok(t('RULE_ORDER.indexOf("remind")')>=0&&t('TOOLS.find(x=>x.function.name==="rules_read").function.parameters.properties.area.enum').includes('remind'),'rules_read knows remind');
 const rr=await run('rules_read',{area:'remind'});ok(/REMINDERS/.test(rr.res),'rules_read remind works');
 ok(/^2026-\d\d-\d\d\.\d+$/.test(t('RULES_VER')),'RULES_VER bumped so the rules folder copy is rewritten');

 // ---- 8. Java side and patch script agree with JS
 const J=fs.readFileSync(__dirname+'/../native/NotifyCore.java','utf8'),PL=fs.readFileSync(__dirname+'/../native/NotifyPlugin.java','utf8'),PA=fs.readFileSync(__dirname+'/../scripts/patch-android.js','utf8');
 ok(/CH_REMIND = "chaman_remind_v2"/.test(J)&&/CH_REPORT = "chaman_report"/.test(J)&&/CH_TASK = "chaman_task"/.test(J),'Java channel ids = chaman_ + JS channel names');
 ok(/MAX = 50/.test(J)&&/Maximum 50|MAX/.test(PL),'limit 50 in Java');
 ok(/name = "Notify"/.test(PL)&&['status','requestNotif','openNotifSettings','openExact','openBattery','setMode','setWake','rearm','show','add','list','cancel','clear'].every(m=>new RegExp('public void '+m+'\\(PluginCall').test(PL)),'plugin "Notify" has every method sched.js and perms.js call');
 ok(['NotifyCore.java','NotifyReceiver.java','NotifyBootReceiver.java','NotifyPlugin.java'].every(f=>PA.includes("'"+f+"'")),'patch-android copies the 4 Notify Java files');
 ok(/registerPlugin\(NotifyPlugin\.class\)/.test(PA),'MainActivity registers NotifyPlugin');
 ok(/WAKE_LOCK/.test(PA)&&/SCHEDULE_EXACT_ALARM/.test(PA)&&/RECEIVE_BOOT_COMPLETED/.test(PA)&&/POST_NOTIFICATIONS/.test(PA)&&/NotifyBootReceiver/.test(PA)&&/BOOT_COMPLETED/.test(PA)&&/MY_PACKAGE_REPLACED/.test(PA),'manifest gets permissions and boot receiver');
 ok(/android:name="com.chaman.nap.NotifyReceiver" android:exported="false"/.test(PA),'fire receiver is not exported');
 ok(/ic_stat_chaman/.test(PA)&&/ic_stat_chaman/.test(J),'status bar icon is written and used');
 const sh=fs.readFileSync('index.html','utf8');
 ok(sh.indexOf('js/sched.js')>sh.indexOf('js/imagegen.js')&&sh.indexOf('js/sched.js')<sh.indexOf('js/rules.js')&&sh.indexOf('js/sched.js')<sh.indexOf('js/perms.js'),'sched.js loads after tools and before rules/perms');
 ok(/^\d+\.\d{5}\.\d+$/.test(t('APP_VER'))&&+t('APP_VER').split('.')[1]>=29000,'version is at least the notification feature (1.29000.0): '+t('APP_VER'));

 // ---- 9. reliability step (1.29000.1): status, log, mode, wake, startup rearm, Java safeguards
 ok(NY.calls.includes('rearm'),'app start asks native to put alarms back (rearm)');
 NY.list=[];t('H.length=0');
 await t('remindCmd')('status');ok(/Notifications: on/.test(lastMsg().content)&&/Mode: clock/.test(lastMsg().content)&&/Screen jagana: on/.test(lastMsg().content)&&/SDK: 34/.test(lastMsg().content),'/remind status shows notifications, mode, wake, sdk');
 NY.status.notif=false;await t('remindCmd')('status');ok(/BAND/.test(lastMsg().content),'/remind status says plainly when notifications are off');NY.status.notif=true;
 await t('remindCmd')('mode quiet');ok(NY.status.mode==='quiet'&&/Mode ab: quiet/.test(lastMsg().content),'/remind mode quiet');
 await t('remindCmd')('mode');ok(/Mode abhi: quiet/.test(lastMsg().content),'/remind mode shows current');
 await t('remindCmd')('mode clock');ok(NY.status.mode==='clock','/remind mode clock');
 await t('remindCmd')('wake off');ok(NY.status.wake===false&&/off/.test(lastMsg().content),'/remind wake off');
 await t('remindCmd')('wake on');ok(NY.status.wake===true,'/remind wake on');
 await t('remindCmd')('log');ok(/log khaali/.test(lastMsg().content),'/remind log empty');
 const D0=L(2026,11,2,7,30,0);
 NY.hist=[{id:'a',title:'Chai',due:D0,fired:D0+62000,kind:'fired',via:'exact',screen:false,idle:true,exact:true},{id:'b',title:'Gm',due:D0,fired:D0-62000,kind:'early-skip',via:'inexact',screen:true,idle:false,exact:false},{id:'c',title:'Late one',due:D0,fired:D0+3600000,kind:'late',via:'clock',screen:true,idle:false,exact:true}];
 await t('remindCmd')('log');const lg2=lastMsg().content;
 ok(/\+62s/.test(lg2)&&/-62s/.test(lg2)&&/screen off/.test(lg2)&&/doze/.test(lg2)&&/JALDI/.test(lg2)&&/LATE/.test(lg2)&&/via exact/.test(lg2)&&/exact nahi/.test(lg2),'/remind log shows due time, difference in seconds, via, screen, doze, early and late');
 ok(lg2.indexOf('Late one')<lg2.indexOf('Chai'),'/remind log lists newest first');
 await t('remindCmd')('10m chai');await t('remindCmd')('list');ok(/\[clock\]/.test(lastMsg().content)||/10:|:\d\d \(ek baar\)/.test(lastMsg().content),'/remind list works with the via tag');
 const J2=fs.readFileSync(__dirname+'/../native/NotifyCore.java','utf8'),JP=fs.readFileSync(__dirname+'/../native/NotifyPlugin.java','utf8');
 ok(/setAlarmClock/.test(J2)&&/setExactAndAllowWhileIdle/.test(J2)&&/setAndAllowWhileIdle/.test(J2)&&/K_MODE/.test(J2),'Java: alarm clock first, then exact, then inexact');
 ok(/now < at - EARLY_MS/.test(J2)&&/early-skip/.test(J2)&&/MAX_EARLY/.test(J2),'Java: an alarm that comes more than 5 s early is not shown, it is set again');
 ok(/ACQUIRE_CAUSES_WAKEUP/.test(J2)&&/enableVibration\(true\)/.test(J2)&&/setVibrationPattern/.test(J2),'Java: reminders vibrate and light the screen');
 ok(/deleteNotificationChannel\(CH_REMIND_OLD\)/.test(J2),'Java: old reminder channel (no vibration) is removed, new id used');
 ok(/snapshot\(c\);\s*\n\s*long at/.test(J2.replace(/\r/g,''))||/JSONObject snap = snapshot\(c\);/.test(J2),'Java: screen/idle state is read before the screen is woken');
 ok(/setMode/.test(JP)&&/setWake/.test(JP)&&/public void rearm/.test(JP),'Java plugin: setMode, setWake, rearm');
 // exact-alarm card is not needed in clock mode (perms)
 ok(/r\.mode==='clock'/.test(fs.readFileSync('js/perms.js','utf8')),'exact alarm card counts as done in clock mode');
 ok(/\/remind log/.test(t('ruleText')('remind')),'rules tell the AI to ask for /remind status and /remind log, not to guess');

 // ---- 10. Step24 (3b-1): AI schedules
 ok(NY.calls.includes('setAi')&&NY.calls.includes('takeBriefs'),'app start sends the AI keys to the phone and asks for finished AI texts');
 // config for the native side
 t("S.keys={};S.prov='groq';S.models={};S.ptr={}");
 ok(t('schAiCfg()').length===0,'no keys -> no providers');
 t("S.keys.groq='gsk_aaaaaaaa1, gsk_bbbbbbbb2';S.keys.nvidia='nvapi-cccccccc3';S.ptr.groq=1");
 const cfg=t('schAiCfg()');
 ok(cfg.length>=2&&cfg[0].id==='groq'&&cfg[0].keys.length===2&&/^https:\/\//.test(cfg[0].url)&&cfg[0].read===40&&cfg[0].ptr===1&&!!cfg[0].model,'config: selected provider first, its keys, https url, model, key pointer, read 40 s');
 const nv=cfg.find(x=>x.id==='nvidia');ok(nv&&nv.read===90&&nv.keys[0]==='nvapi-cccccccc3','NVIDIA gets a longer read limit');
 ok(!cfg.some(x=>x.id==='chaman')&&cfg.every(x=>x.keys.length>0),'the chat-only Chaman model and providers without keys are not sent');
 t("S.models.groq='my-model'");ok(t('schAiCfg()')[0].model==='my-model','a model chosen in Settings is used');
 t("S.keys.groq='k1k1k1k1,k2k2k2k2,k3k3k3k3,k4k4k4k4,k5k5k5k5,k6k6k6k6,k7k7k7k7,k8k8k8k8'");ok(t('schAiCfg()')[0].keys.length===6,'at most 6 keys per provider');
 t("S.keys.groq='gsk_aaaaaaaa1, gsk_bbbbbbbb2';S.models={}");
 // sync only when changed
 NY.aiSets=0;t("SCH_AI_LAST=''");
 let n1=await t('schSyncAi')();let n2=await t('schSyncAi')();
 ok(n1>=2&&NY.aiSets===1&&n2===n1,'sync sends once, the same config is not sent again');
 await t('schSyncAi')(true);ok(NY.aiSets===2,'force sends again');
 t("S.keys.groq='gsk_zzzzzzzz9'");await t('schSyncAi')();ok(NY.aiSets===3&&NY.ai[0].keys[0]==='gsk_zzzzzzzz9','a changed key is sent');
 t("S.keys.groq='gsk_aaaaaaaa1, gsk_bbbbbbbb2'");
 NY.aiFail=true;t("SCH_AI_LAST=''");ok(await t('schSyncAi')(true)===-1,'native failure -> -1');NY.aiFail=false;
 await t('schSyncAi')(true);

 // resolve for AI
 let ra=t('schResolve')({kind:'ai',prompt:'ek chhota good morning message',time:'07:00',repeat:'daily'},sun6);
 ok(!ra.err&&ra.kind==='ai'&&ra.prompt==='ek chhota good morning message'&&ra.title==='Chaman'&&ra.channel==='report'&&ra.text===''&&ra.rep==='daily'&&ra.at===L(2026,11,1,7,0),'AI schedule: prompt kept, title Chaman, report channel, no text, daily 07:00');
 ok(t('schResolve')({kind:'ai',time:'07:00'},sun6).err&&t('schResolve')({kind:'ai',prompt:'ab',time:'07:00'},sun6).err,'AI schedule needs a prompt of at least 3 chars');
 ok(t('schResolve')({kind:'ai',prompt:'x'.repeat(900),in_minutes:5},sun6).prompt.length===500,'prompt cut at 500 chars');
 ok(t('schResolve')({kind:'ai',prompt:'hello there',in_minutes:5,title:'Subah'},sun6).title==='Subah','own title is kept');
 ok(t('schResolve')({text:'x',in_minutes:5},sun6).kind===undefined,'a normal schedule is not AI');

 // schedule_ai tool
 const TCa={n:0,ans:true,last:null};
 ctx.tconfirm=async(h,b,w,l,by)=>{TCa.n++;TCa.last={h,b,w,l,by};return TCa.ans};
 NY.list=[];NY.calls.length=0;
 t("S.keys={}");x=await run('schedule_ai',{prompt:'good morning likh',time:'07:00',repeat:'daily'});
 ok(/key phone ko nahi mili/.test(x.res)&&NY.list.length===0&&TCa.n===0,'no AI key: refused before any card, nothing scheduled');
 t("S.keys.groq='gsk_aaaaaaaa1, gsk_bbbbbbbb2'");
 x=await run('schedule_ai',{prompt:'ek chhota good morning message',time:'07:00',repeat:'daily'});
 ok(TCa.n===1&&/AI notification schedule karu/.test(TCa.last.h)&&/kab: /.test(TCa.last.b)&&/roz/.test(TCa.last.b)&&/kya: ek chhota good morning message/.test(TCa.last.b)&&TCa.last.l==='Schedule karo'&&TCa.last.by==='Schedule','confirm card shows when and what, label Schedule karo');
 ok(NY.list.length===1&&NY.lastAdd.kind==='ai'&&NY.lastAdd.prompt==='ek chhota good morning message'&&NY.lastAdd.channel==='chaman_report'&&NY.lastAdd.rep==='daily'&&NY.lastAdd.h===7&&NY.lastAdd.m===0,'after Allow the native add gets kind ai, prompt, report channel, daily 07:00');
 ok(/AI schedule ho gaya: id r[0-9a-z]+/.test(x.res)&&/10 minute pehle/.test(x.res)&&/nahi ban paya/.test(x.res),'result says the AI text comes ~10 min before and what happens on failure');
 TCa.ans=false;NY.list=[];TCa.n=0;x=await run('schedule_ai',{prompt:'good morning likh',time:'07:00'});
 ok(/cancel kiya/.test(x.res)&&NY.list.length===0,'Najeef says no: nothing scheduled');TCa.ans=true;
 x=await run('schedule_ai',{time:'07:00'});ok(/prompt chahiye/.test(x.res)&&TCa.n===1,'no prompt: refused, no card');
 x=await run('schedule_ai',{prompt:'good morning likh',time:'25:00'});ok(/time sahi nahi/.test(x.res),'bad time refused');
 NY.addErr={code:'LIMIT',message:'Maximum 5 AI schedules ho chuke. Kuch cancel karo.'};x=await run('schedule_ai',{prompt:'good morning likh',time:'07:00'});ok(/Maximum 5 AI/.test(x.res),'native limit message shown');NY.addErr=null;
 NY.list=[];await run('schedule_ai',{prompt:'good morning likh',in_minutes:30,title:'Subah'});
 x=await run('schedule_list',{});ok(/\[AI\] good morning likh/.test(x.res),'schedule_list marks AI schedules and shows the prompt');
 ok(t('TOOLS.find(x=>x.function.name==="schedule_ai").function.parameters.required.join()')==='prompt'&&!t('TOOLS.find(x=>x.function.name==="schedule_ai").function.parameters.required').includes('time'),'schedule_ai tool needs only the prompt');
 ok(!/AI-written|schedule_ai/.test('')&&/schedule_ai/.test(t('ruleText')('remind'))&&/NO tools and NO internet/.test(t('ruleText')('remind')),'rules text: schedule_ai, and that the AI at run time has no tools or internet');
 ok(/schedule_ai/.test(t('skillText()')),'skill lists schedule_ai');
 ok(/schedule_ai/.test(t('logTool')('schedule_ai',{prompt:'SECRETPROMPT',time:'07:00'}))&&!/SECRETPROMPT/.test(t('logTool')('schedule_ai',{prompt:'SECRETPROMPT',time:'07:00'})),'log line for schedule_ai has no prompt text');

 // typed /remind ... ai:
 let pa=t('schParseCmd')('roz 07:00 ai: ek chhota good morning',sun6);
 ok(pa&&pa.a.kind==='ai'&&pa.a.prompt==='ek chhota good morning'&&pa.a.repeat==='daily'&&pa.a.time==='07:00'&&pa.a.text==='','parse: roz 07:00 ai: <prompt>');
 pa=t('schParseCmd')('2m AI : bas ek line',sun6);ok(pa&&pa.a.kind==='ai'&&pa.a.in_minutes===2&&pa.a.prompt==='bas ek line','parse: 2m ai: <prompt> (any case, spaces)');
 pa=t('schParseCmd')('10m ai chai',sun6);ok(pa&&pa.a.kind===undefined&&pa.a.text==='ai chai','"ai" without a colon is just text');
 NY.list=[];t('H.length=0');await t('remindCmd')('roz 07:00 ai: ek chhota good morning message');
 ok(/AI schedule set/.test(lastMsg().content)&&/Prompt: ek chhota good morning message/.test(lastMsg().content)&&NY.list.length===1&&NY.list[0].kind==='ai'&&TCa.n>=0,'/remind roz 07:00 ai: ... sets an AI schedule (typed by him: no card)');
 t("S.keys={}");await t('remindCmd')('5m ai: kuch likh');ok(/AI key phone ko nahi mili/.test(lastMsg().content),'/remind ai: without keys says so');
 t("S.keys.groq='gsk_aaaaaaaa1, gsk_bbbbbbbb2'");
 await t('remindCmd')('5m ai:');ok(/prompt chahiye/.test(lastMsg().content),'/remind ai: with an empty prompt is refused');
 await t('remindCmd')('list');ok(/\[AI\] ek chhota good morning message/.test(lastMsg().content),'/remind list shows [AI]');
 await t('schSyncAi')(true);await t('remindCmd')('status');ok(/AI keys \(phone ke andar copy\): \d+ provider, \d+ key/.test(lastMsg().content),'/remind status shows the AI keys the phone has');
 NY.ai=[];await t('remindCmd')('status');ok(/AI keys \(phone ke andar copy\): nahi mili/.test(lastMsg().content),'/remind status says when the phone has no AI keys');
 await t('remindCmd')('help');ok(/ai: /.test(lastMsg().content),'/remind help mentions ai:');
 // log lines with AI info
 const D1=L(2026,11,2,7,0,0);
 NY.hist=[{id:'a',title:'Chaman',due:D1,fired:D1+1000,kind:'fired',via:'clock',screen:false,idle:true,exact:true,ai:'ok:GROQ'},{id:'b',title:'Chaman',due:D1,fired:D1+2000,kind:'fired',via:'clock',screen:false,idle:false,exact:true,ai:'fail:HTTP 401'}];
 await t('remindCmd')('log');ok(/AI ok \(GROQ\)/.test(lastMsg().content)&&/AI FAIL \(HTTP 401\)/.test(lastMsg().content),'/remind log shows whether the AI text worked');NY.hist=[];

 // briefs go into the chat
 t('H.length=0;TURN=null');NY.briefs=[{id:'a',title:'Chaman',text:'Good morning Najeef, aaj Monday hai.',due:D1,late:false,by:'GROQ'},{id:'b',title:'Chaman',text:'Der se aaya text',due:D1,late:true,by:'CEREBRAS'}];
 const nb=await t('schBriefs')();
 ok(nb===2&&t('H').length===2&&t('H')[0].role==='assistant'&&/Brief \(GROQ\)/.test(t('H')[0].by)&&t('H')[0].content==='Good morning Najeef, aaj Monday hai.'&&/^\(late\) Der se aaya text/.test(t('H')[1].content),'finished AI texts are put in the chat (late ones marked)');
 ok(NY.briefs.length===0&&(await t('schBriefs')())===0,'each text is given only once');
 NY.briefs=[{id:'c',title:'Chaman',text:'x',due:D1,late:false,by:''}];t('TURN={stop:false}');t('H.length=0');
 ok((await t('schBriefs')())===0&&t('H').length===0&&NY.briefs.length===1,'while a chat turn is running nothing is added (and nothing is taken)');t('TURN=null');
 ok((await t('schBriefs')())===1&&t('H').length===1,'after the turn it is added');

 // ---- Java side: structure checks (compiled separately with android.jar)
 const NA=fs.readFileSync(__dirname+'/../native/NotifyAi.java','utf8'),NC2=fs.readFileSync(__dirname+'/../native/NotifyCore.java','utf8'),AC=fs.readFileSync(__dirname+'/../native/AiClient.java','utf8'),JS2=fs.readFileSync(__dirname+'/../native/AiJobService.java','utf8'),NR=fs.readFileSync(__dirname+'/../native/NotifyReceiver.java','utf8'),NP=fs.readFileSync(__dirname+'/../native/NotifyPlugin.java','utf8'),PA2=fs.readFileSync(__dirname+'/../scripts/patch-android.js','utf8');
 ok(/LEAD_MS = 10L \* 60L \* 1000L/.test(NA)&&/ACT_PREP/.test(NA)&&/setExactAndAllowWhileIdle/.test(NA)&&/setAndAllowWhileIdle/.test(NA),'Java: prep alarm 10 minutes before the due time');
 ok(/JobInfo\.NETWORK_TYPE_ANY/.test(NA)&&/setExpedited\(true\)/.test(NA)&&/setBackoffCriteria/.test(NA)&&/RUN_RECENT_MS/.test(NA)&&/jobAt/.test(NA),'Java: job needs internet, expedited on Android 12+, backoff, and re-arming does not restart a recent job');
 ok(/startsWith\("https:\/\/"\)/.test(NA)&&/startsWith\("https:\/\/"\)/.test(AC),'Java: only https providers are stored and used');
 ok(/NotifyAi\.render\(c, r\)/.test(NC2)&&/NotifyAi\.armPrep\(c, r\)/.test(NC2)&&/NotifyAi\.disarmPrep\(c, id\)/.test(NC2)&&/r\.remove\("res"\)/.test(NC2),'Java: fire uses the AI text, arm sets the prep alarm, disarm cancels it, repeat clears the old result');
 ok(/ACT_PREP/.test(NR)&&/NotifyAi\.prep/.test(NR),'Java: the receiver handles the prep alarm');
 ok(/public void setAi/.test(NP)&&/public void takeBriefs/.test(NP)&&/MAX_AI/.test(NP)&&/"ai"\.equals\(call\.getString\("kind"/.test(NP),'Java plugin: setAi, takeBriefs, at most 5 AI schedules');
 ok(/extends JobService/.test(JS2)&&/jobFinished\(params, r == 1\)/.test(JS2)&&/onStopJob/.test(JS2),'Java: job service reports finished and asks for a retry only when needed');
 ok(/AiJobService\.java/.test(PA2)&&/BIND_JOB_SERVICE/.test(PA2)&&/ACCESS_NETWORK_STATE/.test(PA2)&&/NotifyAi\.java/.test(PA2)&&/AiClient\.java/.test(PA2),'patch script: copies the AI files, registers the job service, adds network permissions');
 ok(!/Log\.|printStackTrace/.test(AC+NA),'Java: no logging that could print keys');

 console.log(fails?('\n'+fails+' FAIL'):'\nALL PASS');
 process.exit(fails?1:0);
})();
