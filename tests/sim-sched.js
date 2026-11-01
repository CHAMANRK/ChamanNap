// Step22: Chaman's own notifications + scheduler (sched.js + Notify plugin). Tools, /remind, rules area, time maths, honest results, and checks that the Java side and the patch script match the JS.
const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){},remove(){},toggle(){}},addEventListener(t,f){const k=sel+':'+t,pv=handlers[k];handlers[k]=pv?async e=>{await pv(e);await f(e)}:f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},focus(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){handlers[sel+':change']=f},scrollHeight:0,scrollTop:0,disabled:false,textContent:'',srcdoc:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}},addEventListener(){}};
const store={},sent=[],pills=[];let failWith=null,failPkgOnly=false;
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,3)),clearTimeout,URL,Image:function(){},fetch:async()=>({ok:true,status:200,json:async()=>({choices:[{message:{role:'assistant',content:'ok'}}]}),text:async()=>''})};
ctx.window=ctx;
// Native Notify mock: keeps schedules like NotifyPlugin does
const NY={list:[],hist:[],calls:[],status:{notif:true,exact:true,battery:true,count:0},shown:[],showOk:true,addErr:null};
ctx.Capacitor={nativePromise:async(pl,m,o)=>{
  if(pl==='Notify'){
    NY.calls.push(m);
    if(m==='status')return Object.assign({},NY.status,{count:NY.list.length});
    if(m==='show'){NY.shown.push(o);return{shown:NY.showOk}}
    if(m==='add'){
      if(NY.addErr)return Promise.reject(Object.assign(new Error(NY.addErr.message),{code:NY.addErr.code}));
      const at=o.rep==='none'?o.at:o.at;NY.list=NY.list.filter(x=>x.id!==o.id);NY.list.push({id:o.id,title:o.title,text:o.text,ch:o.channel,rep:o.rep,at,h:o.h,m:o.m});
      NY.lastAdd=o;return{id:o.id,at,exact:NY.status.exact}}
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
 NY.status.notif=false;NY.status.exact=false;
 x=await run('schedule_add',{text:'x',in_minutes:5});
 ok(/band hain/.test(x.res)&&/Exact alarm/.test(x.res),'warns when notifications are off and exact alarm is missing');
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
 ok(t('RULES_VER')==='2026-11-01.1','RULES_VER bumped so the rules folder copy is rewritten');

 // ---- 8. Java side and patch script agree with JS
 const J=fs.readFileSync(__dirname+'/../native/NotifyCore.java','utf8'),PL=fs.readFileSync(__dirname+'/../native/NotifyPlugin.java','utf8'),PA=fs.readFileSync(__dirname+'/../scripts/patch-android.js','utf8');
 ok(/CH_REMIND = "chaman_remind"/.test(J)&&/CH_REPORT = "chaman_report"/.test(J)&&/CH_TASK = "chaman_task"/.test(J),'Java channel ids = chaman_ + JS channel names');
 ok(/MAX = 50/.test(J)&&/Maximum 50|MAX/.test(PL),'limit 50 in Java');
 ok(/name = "Notify"/.test(PL)&&['status','requestNotif','openNotifSettings','openExact','openBattery','show','add','list','cancel','clear'].every(m=>new RegExp('public void '+m+'\\(PluginCall').test(PL)),'plugin "Notify" has every method sched.js and perms.js call');
 ok(['NotifyCore.java','NotifyReceiver.java','NotifyBootReceiver.java','NotifyPlugin.java'].every(f=>PA.includes("'"+f+"'")),'patch-android copies the 4 Notify Java files');
 ok(/registerPlugin\(NotifyPlugin\.class\)/.test(PA),'MainActivity registers NotifyPlugin');
 ok(/SCHEDULE_EXACT_ALARM/.test(PA)&&/RECEIVE_BOOT_COMPLETED/.test(PA)&&/POST_NOTIFICATIONS/.test(PA)&&/NotifyBootReceiver/.test(PA)&&/BOOT_COMPLETED/.test(PA)&&/MY_PACKAGE_REPLACED/.test(PA),'manifest gets permissions and boot receiver');
 ok(/android:name="com.chaman.nap.NotifyReceiver" android:exported="false"/.test(PA),'fire receiver is not exported');
 ok(/ic_stat_chaman/.test(PA)&&/ic_stat_chaman/.test(J),'status bar icon is written and used');
 const sh=fs.readFileSync('index.html','utf8');
 ok(sh.indexOf('js/sched.js')>sh.indexOf('js/imagegen.js')&&sh.indexOf('js/sched.js')<sh.indexOf('js/rules.js')&&sh.indexOf('js/sched.js')<sh.indexOf('js/perms.js'),'sched.js loads after tools and before rules/perms');
 ok(/^\d+\.\d{5}\.\d+$/.test(t('APP_VER'))&&+t('APP_VER').split('.')[1]>=29000,'version is at least the notification feature (1.29000.0): '+t('APP_VER'));

 console.log(fails?('\n'+fails+' FAIL'):'\nALL PASS');
 process.exit(fails?1:0);
})();
