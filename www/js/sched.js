// Step22: Chaman's own notifications + scheduler. The native plugin "Notify" (NotifyPlugin.java + NotifyCore.java) keeps the schedules and fires
// them from an Android alarm, so a reminder arrives with the screen off and with the app closed. No Termux needed. This file = tools + /remind.
// Fixed-text schedules show the text you give. Step24 (3b-1) adds AI schedules (kind ai): the phone asks the AI itself ~10 min before and shows the result at the time.
// Quiet hours and news (RSS) come in later steps.
const NY=(m,o)=>NPx('Notify',m,o);
const SCH_CH={remind:1,report:1,task:1};
const SCH_REP={none:1,daily:1,weekdays:1};
const SCH_HELP='Reminder (Chaman ki apni notification):\n'
  +'/remind 10m chai ready        10 minute baad\n'
  +'/remind 2h call karna          2 ghante baad\n'
  +'/remind 07:30 uthna            agla 07:30 (aaj ya kal)\n'
  +'/remind kal 18:00 meeting      kal 18:00\n'
  +'/remind roz 07:30 good morning  har din\n'
  +'/remind weekdays 09:00 standup  Mon-Fri\n'
  +'/remind list   /remind del <no>   /remind clear   /remind test\n'
  +'Kaam na kare to: /remind status aur /remind log (output Claude ko bhejo)\n'
  +'/remind mode clock|quiet   /remind wake on|off\n'
  +'AI likhe: /remind roz 07:00 ai: ek chhota good morning message (net chahiye, app band ho tab bhi)';
let SCH_NOW_T=[];
const schPad=n=>n<10?'0'+n:''+n;
const schFmt=ms=>{const d=new Date(ms);return d.getFullYear()+'-'+schPad(d.getMonth()+1)+'-'+schPad(d.getDate())+' '+schPad(d.getHours())+':'+schPad(d.getMinutes())};
const schFmtT=ms=>{const d=new Date(ms);return schPad(d.getHours())+':'+schPad(d.getMinutes())+':'+schPad(d.getSeconds())};
const schClean=(t,n)=>String(t==null?'':t).replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
const schId=()=>'r'+Date.now().toString(36)+Math.floor(Math.random()*1296).toString(36);
// Same rule as NotifyCore.nextFire (Java): first h:m strictly after "after", local time, weekdays skips Sat/Sun.
function schNext(rep,h,m,after){
  const d=new Date(after);d.setHours(h,m,0,0);
  if(d.getTime()<=after)d.setDate(d.getDate()+1);
  if(rep==='weekdays'){let g=0;while(g++<8&&(d.getDay()===0||d.getDay()===6))d.setDate(d.getDate()+1)}
  return d.getTime();
}
const schRepName=r=>r==='daily'?'roz':r==='weekdays'?'Mon-Fri':'ek baar';
// tool args -> {title,text,channel,rep,at,h,m} or {err}. now = Date.now() (a parameter so tests can fix it).
function schResolve(a,now){
  a=a||{};now=now||Date.now();
  const isAi=a.kind==='ai',prompt=isAi?schClean(a.prompt,500):'';
  const title=schClean(a.title,80)||(isAi?'Chaman':''),text=isAi?'':schClean(a.text,300);
  if(isAi&&prompt.length<3)return{err:'prompt chahiye (AI ko kya likhna hai, 3 se 500 chars).'};
  if(!isAi&&!title&&!text)return{err:'title ya text chahiye.'};
  const channel=SCH_CH[a.channel]?a.channel:(isAi?'report':'remind');
  const rep=a.repeat==null||a.repeat===''?'none':String(a.repeat).toLowerCase();
  if(!SCH_REP[rep])return{err:'repeat none, daily ya weekdays hona chahiye.'};
  const out={title:title||'Chaman',text,channel,rep,h:0,m:0,at:0};
  if(isAi){out.kind='ai';out.prompt=prompt}
  if(a.in_minutes!=null&&a.in_minutes!==''){
    if(rep!=='none')return{err:'in_minutes ke saath repeat nahi chalta. time (HH:MM) do.'};
    const n=+a.in_minutes;
    if(!isFinite(n)||n<1||n>43200)return{err:'in_minutes 1 se 43200 (30 din) ke beech hona chahiye.'};
    out.at=now+Math.round(n)*60000;
    return out;
  }
  const mm=/^(\d{1,2})(?::(\d{2}))?$/.exec(String(a.time==null?'':a.time).trim());
  if(!mm)return{err:'time HH:MM (24 ghante) me do, ya in_minutes do.'};
  const h=+mm[1],m=mm[2]==null?0:+mm[2];
  if(h>23||m>59)return{err:'time sahi nahi (HH 0-23, MM 0-59).'};
  out.h=h;out.m=m;
  if(rep!=='none'){out.at=schNext(rep,h,m,now);return out}
  const dt=a.date==null||a.date===''?'':String(a.date).toLowerCase().trim();
  if(!dt){out.at=schNext('none',h,m,now);return out}
  const d=new Date(now);
  if(dt==='today'||dt==='aaj'){}
  else if(dt==='tomorrow'||dt==='kal')d.setDate(d.getDate()+1);
  else{
    const dm=/^(\d{4})-(\d{2})-(\d{2})$/.exec(dt);
    if(!dm)return{err:'date today, tomorrow ya YYYY-MM-DD hona chahiye.'};
    d.setFullYear(+dm[1],+dm[2]-1,+dm[3]);
    if(d.getMonth()!==+dm[2]-1||d.getDate()!==+dm[3])return{err:'date sahi nahi: '+dt};
  }
  d.setHours(h,m,0,0);
  if(d.getTime()<=now+2000)return{err:'Ye time nikal chuka hai ('+schFmt(d.getTime())+').'};
  if(d.getTime()>now+366*86400000)return{err:'Ek saal se aage ka schedule nahi.'};
  out.at=d.getTime();
  return out;
}
function schLogLine(e){
  const d=Math.round((e.fired-e.due)/1000),dl=(d>0?'+':'')+d+'s';
  const kind=e.kind==='late'?'LATE (phone band ya alarm gaya tha)':e.kind==='early-skip'?'JALDI aaya, dubara set kiya':'aaya';
  return schFmtT(e.fired)+' '+kind+' (due '+schFmtT(e.due)+', '+dl+') via '+(e.via||'?')+', screen '+(e.screen?'on':'off')+(e.idle?', doze':'')+(e.exact===false?', exact nahi':'')+(e.ai?' | AI '+(/^ok:/.test(e.ai)?'ok ('+e.ai.slice(3)+')':'FAIL ('+e.ai.slice(5)+')'):'')+' | '+schClean(e.title,30);
}
const schIdList=async()=>{const r=await NY('list');return(r.items||[]).slice().sort((x,y)=>x.at-y.at)};
async function schAdd(o){
  const id=schId();
  const r=await NY('add',{id,title:o.title,text:o.text,channel:'chaman_'+o.channel,rep:o.rep,at:o.at,h:o.h,m:o.m,kind:o.kind||'',prompt:o.prompt||''});
  return{id,at:r.at||o.at,exact:r.exact!==false,via:r.via||''};
}
async function schTool(name,a,note,fl){
  const bad=s=>{fl.bad=true;return note(s)};
  try{
    if(name==='notify_now'){
      const t=Date.now();SCH_NOW_T=SCH_NOW_T.filter(x=>t-x<60000);
      if(SCH_NOW_T.length>=3)return bad('Ek minute me 3 se zyada notification nahi bhej sakte. Thodi der baad.');
      const title=schClean(a.title,80),text=schClean(a.text,300);
      if(!title&&!text)return bad('title ya text chahiye.');
      SCH_NOW_T.push(t);
      const r=await NY('show',{title:title||'Chaman',text,channel:SCH_CH[a.channel]?'chaman_'+a.channel:'chaman_remind'});
      if(!r.shown)return bad('Notification nahi dikhi: Android me Chaman ki notifications band hain. Najeef ko permission card ya Settings se on karne bolo.');
      return note('Notification bheji.');
    }
    if(name==='schedule_add'){
      const o=schResolve(a);
      if(o.err)return bad(o.err);
      const r=await schAdd(o);
      let msg='Schedule ho gaya: id '+r.id+', '+schFmt(r.at)+' ('+schRepName(o.rep)+').';
      let warn='';
      try{const st=await NY('status');if(!st.notif)warn+=' Notifications Android me band hain, Najeef ko allow karne bolo.'}catch(e){}
      if(!r.exact)warn+=' Exact alarm permission nahi hai, isliye time thoda late ho sakta hai.';
      return note(msg)+warn+' Ye sirf likha hua text dikhayegi, us waqt AI nahi chalega.';
    }
    if(name==='schedule_ai'){
      const o=schResolve(Object.assign({},a,{kind:'ai'}));
      if(o.err)return bad(o.err);
      const n=await schSyncAi(true);
      if(!(n>0))return bad('AI key phone ko nahi mili. Najeef Settings me kam se kam ek AI provider ki key daale (Groq, Cerebras, OpenRouter, NVIDIA ya Mistral).');
      const when=schFmt(o.at)+' ('+schRepName(o.rep)+')';
      const ok=await tconfirm('AI notification schedule karu?','kab: '+when+'\nkya: '+o.prompt+'\n\nPhone khud, app band ho tab bhi, time se ~10 minute pehle AI se ye likhwayega aur time par notification dikhayega. Har baar ek AI request lagegi.',['AI ne ye schedule banaya. Tere Allow ke bina nahi banta.'],'Schedule karo','Schedule');
      if(!ok){fl.bad=true;return note('Najeef ne AI schedule cancel kiya.')+' Dobara mat banao, pucho kya badalna hai.'}
      const r=await schAdd(o);
      let warn='';
      try{const st=await NY('status');if(!st.notif)warn+=' Notifications Android me band hain, Najeef ko allow karne bolo.'}catch(e){}
      return note('AI schedule ho gaya: id '+r.id+', '+when+'.')+warn+' AI text ~10 minute pehle banega, notification time par aayegi. Net ya key fail ho to fixed "nahi ban paya" message aayega, text baad me bhi chat me aa jayega.';
    }
    if(name==='schedule_list'){
      const L=await schIdList();
      if(!L.length)return note('Koi schedule nahi hai.');
      return note(L.length+' schedule hain.')+'\n'+L.slice(0,30).map(x=>x.id+' | '+schFmt(x.at)+' | '+schRepName(x.rep)+' | '+(x.kind==='ai'?'[AI] '+schClean(x.prompt,40):schClean(x.title,40))).join('\n');
    }
    if(name==='schedule_cancel'){
      const id=schClean(a.id,40);
      if(!id)return bad('id chahiye (schedule_list se).');
      const r=await NY('cancel',{id});
      if(!r.removed)return bad('Is id ka schedule nahi mila: '+id);
      return note('Schedule cancel kiya: '+id);
    }
    return bad('Unknown tool: '+name);
  }catch(e){
    const c=e&&e.code;
    if(c==='PAST')return bad('Ye time nikal chuka hai.');
    if(c==='LIMIT')return bad(errMsg(e));
    return bad('Fail: '+errMsg(e));
  }
}
TOOLS.push(
  fn('notify_now','Show a notification from Chaman right now (works without Termux). title is short, text is the message. channel: remind (default), report, task. Max 3 per minute. Use it for an instant message to Najeef outside the chat, not for answers (answer in the chat).',{title:{type:'string'},text:{type:'string'},channel:{type:'string',enum:['remind','report','task']}},['text']),
  fn('schedule_add','Schedule a Chaman notification that the phone itself shows at that time, even when the app is closed or the screen is off (reminders, a daily message). Give EITHER in_minutes OR time (HH:MM, 24 hour) with optional date (today, tomorrow, or YYYY-MM-DD; without date it is the next time that clock time comes). repeat: none (default), daily, weekdays (Mon-Fri; needs time). It shows the fixed title and text you give; the AI is NOT run at that time. It is not a ringing alarm: for that use open_intent alarm_set.',{title:{type:'string'},text:{type:'string'},in_minutes:{type:'integer',minimum:1,maximum:43200},time:{type:'string',description:'HH:MM 24 hour'},date:{type:'string',description:'today, tomorrow or YYYY-MM-DD'},repeat:{type:'string',enum:['none','daily','weekdays']},channel:{type:'string',enum:['remind','report','task']}},[]),
  fn('schedule_ai','Schedule a Chaman notification whose TEXT IS WRITTEN BY AI at that time: the phone itself asks the AI about 10 minutes before and shows the result at the time, even with the app closed (for example a different good morning every day). Give prompt = what the AI should write (3 to 500 chars), and EITHER in_minutes OR time (HH:MM 24 hour) with optional date, and repeat none, daily or weekdays, as in schedule_add. Najeef must tap Allow on a card. The AI at that time has NO tools and NO internet: it knows only the date and time, it cannot read news, weather or his phone (news comes in a later step), so do not promise that. Max 5 AI schedules.',{prompt:{type:'string'},title:{type:'string'},in_minutes:{type:'integer',minimum:1,maximum:43200},time:{type:'string',description:'HH:MM 24 hour'},date:{type:'string',description:'today, tomorrow or YYYY-MM-DD'},repeat:{type:'string',enum:['none','daily','weekdays']}},['prompt']),
  fn('schedule_list','List the notifications scheduled in Chaman (id, time, repeat, title).',{}),
  fn('schedule_cancel','Cancel one scheduled notification by its id (ids come from schedule_list).',{id:{type:'string'}},['id'])
);
// /remind (picked from the / list, like the other commands)
function schParseCmd(arg,now){
  const p=schParseCmd0(arg,now);
  if(p&&p.a){const m=/^ai\s*:\s*([\s\S]*)$/i.exec(String(p.a.text||'').trim());if(m){p.a.kind='ai';p.a.prompt=m[1].trim();p.a.text='';p.a.title='Chaman';p.a.channel='report'}}
  return p;
}
function schParseCmd0(arg,now){
  arg=String(arg||'').trim();now=now||Date.now();
  let m=/^(roz|daily|weekdays)\s+(\d{1,2}(?::\d{2})?)\s*(.*)$/i.exec(arg);
  if(m){const rep=/^weekdays$/i.test(m[1])?'weekdays':'daily';return{a:{repeat:rep,time:m[2],text:m[3],title:'Reminder',channel:'remind'}}}
  m=/^(aaj|kal|today|tomorrow)\s+(\d{1,2}(?::\d{2})?)\s*(.*)$/i.exec(arg);
  if(m)return{a:{date:m[1].toLowerCase(),time:m[2],text:m[3],title:'Reminder',channel:'remind'}};
  m=/^(\d{1,4})\s*(m|min|mins|minute|minutes|h|hr|hrs|ghante|ghanta)\b\s*(.*)$/i.exec(arg);
  if(m){const n=+m[1],hours=/^(h|hr|hrs|ghante|ghanta)$/i.test(m[2]);return{a:{in_minutes:hours?n*60:n,text:m[3],title:'Reminder',channel:'remind'}}}
  m=/^(\d{1,2}:\d{2})\s*(.*)$/.exec(arg);
  if(m)return{a:{time:m[1],text:m[2],title:'Reminder',channel:'remind'}};
  return null;
}
async function remindCmd(arg){
  const say=(c,x)=>H.push(Object.assign({role:'assistant',by:'Remind',info:1,content:c},x||{}));
  arg=String(arg||'').trim();
  try{
    if(!arg||/^(help|\?)$/i.test(arg)){
      const L=await schIdList().catch(()=>[]);
      say(SCH_HELP+(L.length?'\n\nAbhi '+L.length+' schedule hain (/remind list).':''));return;
    }
    if(/^list$/i.test(arg)){
      const L=await schIdList();
      if(!L.length){say('Koi schedule nahi hai.\n\n'+SCH_HELP);return}
      say(L.map((x,i)=>(i+1)+'. '+schFmt(x.at)+' ('+schRepName(x.rep)+')'+(x.via?' ['+x.via+']':'')+' '+(x.kind==='ai'?'[AI] '+schClean(x.prompt,70):schClean(x.title,40)+(x.text?': '+schClean(x.text,60):''))).join('\n')+'\n\nHatane ke liye: /remind del <no>');
      return;
    }
    if(/^status$/i.test(arg)){
      const st=await NY('status');
      say('Notifications: '+(st.notif?'on':'BAND (Android settings me allow karo)')+'\nExact alarm permission: '+(st.exact?'haan':'nahi')+'\nBattery unrestricted: '+(st.battery?'haan':'nahi')+'\nMode: '+(st.mode==='quiet'?'quiet (alarm icon nahi, Doze me late ho sakta hai)':'clock (sabse bharosemand, status bar me alarm icon dikhta hai)')+'\nScreen jagana: '+(st.wake===false?'off':'on')+'\nAI keys (phone ke andar copy): '+(st.aiKeys?st.aiProviders+' provider, '+st.aiKeys+' key':'nahi mili: app Settings me key ho to ek baar app kholo')+'\nSchedules: '+(st.count||0)+'   Android SDK: '+(st.sdk||'?'));return;
    }
    if(/^log$/i.test(arg)){
      const r=await NY('list'),h=(r.hist||[]).slice(-10).reverse();
      if(!h.length){say('Abhi tak koi reminder fire nahi hua (log khaali).');return}
      say(h.map(schLogLine).join('\n')+'\n\n(due = jis time par aana tha, +/- seconds = der ya jaldi. Ye text Claude ko bhejo.)');return;
    }
    let md=/^mode(?:\s+(clock|quiet))?$/i.exec(arg);
    if(md){
      if(!md[1]){const st=await NY('status');say('Mode abhi: '+(st.mode==='quiet'?'quiet':'clock')+'\n/remind mode clock: alarm-clock tarah (sabse bharosemand, status bar me alarm icon dikhta hai)\n/remind mode quiet: bina icon, par Doze me late ho sakta hai');return}
      const st=await NY('setMode',{mode:md[1].toLowerCase()});say('Mode ab: '+st.mode+'. Purane schedule naye tareeke se set ho gaye.');return;
    }
    let wk=/^wake\s+(on|off)$/i.exec(arg);
    if(wk){const st=await NY('setWake',{on:wk[1].toLowerCase()==='on'});say('Screen jagana ab: '+(st.wake?'on (reminder aane par screen 5 second ke liye jagegi)':'off'));return}
    if(/^clear$/i.test(arg)){const r=await NY('clear');say(r.cleared?r.cleared+' schedule hata diye.':'Koi schedule nahi tha.');return}
    let d=/^(?:del|rm|delete|cancel)\s+(\S+)$/i.exec(arg);
    if(d){
      const L=await schIdList(),k=d[1];
      const it=/^\d+$/.test(k)?L[+k-1]:L.find(x=>x.id===k);
      if(!it){say('Ye schedule nahi mila. /remind list se number dekho.');return}
      await NY('cancel',{id:it.id});say('Hata diya: '+schFmt(it.at)+' '+schClean(it.title,40));return;
    }
    if(/^test$/i.test(arg)){
      const o=schResolve({in_minutes:1,title:'Chaman test',text:'Ye test notification hai. Agar ye aayi to reminder kaam kar raha hai.',channel:'remind'});
      const r=await schAdd(o);
      let w='';try{const st=await NY('status');if(!st.notif)w+='\nNotifications Android me band hain, allow karo.'}catch(e){}
      if(!r.exact)w+='\nExact alarm permission nahi, time late ho sakta hai.';
      say('Test notification 1 minute me aayegi ('+schFmt(r.at)+'). Ab screen lock kar do, chahe to app recents se hata do.'+w);return;
    }
    const p=schParseCmd(arg);
    if(!p){say('Samajh nahi aaya.\n\n'+SCH_HELP);return}
    if(p.a.kind!=='ai'&&!String(p.a.text||'').trim()){say('Reminder ka text bhi likho.\n\n'+SCH_HELP);return}
    const o=schResolve(p.a);
    if(o.err){say(o.err);return}
    if(o.kind==='ai'){
      const n=await schSyncAi(true);
      if(!(n>0)){say('AI key phone ko nahi mili. Settings me kam se kam ek AI provider ki key daalo (Groq, Cerebras, OpenRouter, NVIDIA ya Mistral).');return}
    }
    const r=await schAdd(o);
    let w='';try{const st=await NY('status');if(!st.notif)w+='\nNotifications Android me band hain, allow karo.'}catch(e){}
    if(!r.exact)w+='\nExact alarm permission nahi, time thoda late ho sakta hai.';
    if(o.kind==='ai'){say('AI schedule set: '+schFmt(r.at)+' ('+schRepName(o.rep)+')\nPrompt: '+schClean(o.prompt,120)+'\nAI text ~10 minute pehle banega, notification time par aayegi. Net ya key fail ho to fixed "nahi ban paya" message aayega.'+w);return}
    say('Reminder set: '+schFmt(r.at)+' ('+schRepName(o.rep)+')\n'+schClean(o.text,100)+w);
  }catch(e){say('Command fail: '+errMsg(e))}
}
// ---- Step24 (3b-1): AI schedules need the provider keys inside the phone's native code (the app is closed when they run) ----
function schAiCfg(){
  try{
    return provOrder().filter(p=>!p.g&&p.url).map(p=>({id:p.id,name:String(p.name||p.id).replace(' (optional)',''),url:p.url,model:(S.models&&S.models[p.id])||p.model||'',keys:keysOf(p.id).slice(0,6),ptr:(S.ptr&&S.ptr[p.id])||0,read:p.id==='nvidia'?90:40})).filter(x=>x.keys.length);
  }catch(e){return[]}
}
let SCH_AI_LAST='';
// Sends the providers and keys to the native side when they changed (or when force). Returns how many providers the phone has, -1 if it failed.
async function schSyncAi(force){
  const cfg=schAiCfg(),j=JSON.stringify(cfg);
  if(!force&&j===SCH_AI_LAST)return cfg.length;
  try{const r=await NY('setAi',{providers:cfg});SCH_AI_LAST=j;return r&&r.providers!=null?r.providers:cfg.length}catch(e){return-1}
}
// Texts written by AI schedules while the app was closed go into the chat, once.
async function schBriefs(){
  if(typeof TURN!=='undefined'&&TURN)return 0;
  try{
    const r=await NY('takeBriefs'),L=(r&&r.items)||[];
    if(!L.length)return 0;
    L.forEach(b=>H.push({role:'assistant',by:'Brief'+(b.by?' ('+b.by+')':''),content:(b.late?'(late) ':'')+String(b.text||''),steps:[]}));
    persist();render();
    return L.length;
  }catch(e){return 0}
}
// Some phones drop alarms when the app is swiped away. Opening the app puts them all back (overdue ones under 24 h show once, marked late).
const schRearm=()=>NY('rearm').catch(()=>{});
const schOpen=()=>{schRearm();schSyncAi();schBriefs()};
try{setTimeout(schOpen,1500);document.addEventListener('visibilitychange',()=>{if(!document.hidden)schOpen()});setInterval(()=>{if(!document.hidden)schSyncAi()},45000)}catch(e){}
