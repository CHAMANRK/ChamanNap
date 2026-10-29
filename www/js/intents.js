// Step14: open_intent. A catalog of system / app intents (alarm, timer, calendar, settings pages, camera, share ...), so many jobs need no screen taps.
// JS builds the intent from a friendly name + params, native IntentsPlugin checks it again against fixed lists (nothing can call, send SMS, pay or delete).
const NI=(m,o)=>NPx('Intents',m,o);
const INT_OK={
  actions:new Set(['android.intent.action.SET_ALARM','android.intent.action.SHOW_ALARMS','android.intent.action.SET_TIMER','android.intent.action.SHOW_TIMERS','android.intent.action.VIEW','android.intent.action.INSERT','android.intent.action.DIAL','android.intent.action.SENDTO','android.intent.action.SEND','android.intent.action.WEB_SEARCH','android.intent.action.VIEW_DOWNLOADS','android.intent.action.POWER_USAGE_SUMMARY','android.media.action.STILL_IMAGE_CAMERA','android.media.action.IMAGE_CAPTURE','android.media.action.VIDEO_CAMERA','android.media.action.MEDIA_PLAY_FROM_SEARCH','android.provider.MediaStore.RECORD_SOUND','android.net.vpn.SETTINGS','android.settings.SETTINGS','android.settings.WIFI_SETTINGS','android.settings.BLUETOOTH_SETTINGS','android.settings.AIRPLANE_MODE_SETTINGS','android.settings.WIRELESS_SETTINGS','android.settings.DATA_USAGE_SETTINGS','android.settings.DATA_ROAMING_SETTINGS','android.settings.DISPLAY_SETTINGS','android.settings.SOUND_SETTINGS','android.settings.BATTERY_SAVER_SETTINGS','android.settings.LOCATION_SOURCE_SETTINGS','android.settings.NFC_SETTINGS','android.settings.DATE_SETTINGS','android.settings.LOCALE_SETTINGS','android.settings.INPUT_METHOD_SETTINGS','android.settings.ACCESSIBILITY_SETTINGS','android.settings.SECURITY_SETTINGS','android.settings.PRIVACY_SETTINGS','android.settings.APPLICATION_SETTINGS','android.settings.MANAGE_ALL_APPLICATIONS_SETTINGS','android.settings.MANAGE_DEFAULT_APPS_SETTINGS','android.settings.INTERNAL_STORAGE_SETTINGS','android.settings.CAST_SETTINGS','android.settings.DEVICE_INFO_SETTINGS','android.settings.APPLICATION_DEVELOPMENT_SETTINGS','android.settings.SYNC_SETTINGS','android.settings.APPLICATION_DETAILS_SETTINGS','android.settings.APP_NOTIFICATION_SETTINGS','android.settings.panel.action.INTERNET_CONNECTIVITY','android.settings.panel.action.WIFI','android.settings.panel.action.NFC','android.settings.panel.action.VOLUME']),
  cats:new Set(['android.intent.category.APP_CALENDAR','android.intent.category.APP_CALCULATOR','android.intent.category.APP_CONTACTS','android.intent.category.APP_EMAIL','android.intent.category.APP_GALLERY','android.intent.category.APP_MAPS','android.intent.category.APP_MARKET','android.intent.category.APP_MESSAGING','android.intent.category.APP_MUSIC','android.intent.category.APP_BROWSER']),
  schemes:new Set(['http','https','tel','sms','smsto','mailto','geo','google.navigation','market','package','content']),
  contentPrefix:['content://com.android.calendar/'],
  types:new Set(['text/plain','vnd.android.cursor.dir/contact','vnd.android.cursor.dir/calls']),
  keys:new Set(['android.intent.extra.alarm.HOUR','android.intent.extra.alarm.MINUTES','android.intent.extra.alarm.MESSAGE','android.intent.extra.alarm.DAYS','android.intent.extra.alarm.SKIP_UI','android.intent.extra.alarm.LENGTH','title','description','eventLocation','beginTime','endTime','allDay','name','phone','email','company','notes','query','android.intent.extra.focus','android.intent.extra.TEXT','android.intent.extra.SUBJECT','android.provider.extra.APP_PACKAGE'])
};
const A_='android.intent.action.',AL_='android.intent.extra.alarm.';
const IN={};
const idef=(name,g,d,p,build,o)=>{IN[name]=Object.assign({g,d,p:p||'',build},o||{})};
const iStr=(p,k,req,max)=>{const v=String(p[k]==null?'':p[k]).trim();if(!v&&req)throw new Error(k+' chahiye.');return max?v.slice(0,max):v};
const iInt=(p,k,lo,hi,def)=>{
  const raw=p[k];if((raw===undefined||raw===null||raw==='')&&def!==undefined)return def;
  const n=Math.round(+raw);if(!isFinite(n)||n<lo||n>hi)throw new Error(k+' '+lo+' se '+hi+' ke beech hona chahiye.');return n;
};
const iPkg=p=>{const v=iStr(p,'package',true,120);if(!/^[a-zA-Z][\w]*(\.[\w]+)+$/.test(v))throw new Error('package naam sahi nahi (jaise com.whatsapp).');return v};
// "YYYY-MM-DD HH:MM" | "YYYY-MM-DD" | "HH:MM" (today), local time -> ms
function iWhen(v){
  const s=String(v==null?'':v).trim();if(!s)return null;
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/),d;
  if(m)d=new Date(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0),0,0);
  else if((m=s.match(/^(\d{1,2}):(\d{2})$/))){d=new Date();d.setHours(+m[1],+m[2],0,0)}
  if(!d||isNaN(d.getTime()))throw new Error('Time ka format "YYYY-MM-DD HH:MM" hona chahiye: '+cut(s,30));
  return d.getTime();
}
const DAYN={sun:1,mon:2,tue:3,wed:4,thu:5,fri:6,sat:7};
function iDays(v){
  if(v==null||v==='')return[];
  const L=Array.isArray(v)?v:String(v).split(/[,\s]+/);
  const out=[];
  L.forEach(x=>{const k=String(x).trim().toLowerCase().slice(0,3),n=DAYN[k]||(/^[1-7]$/.test(String(x).trim())?+x:0);if(n&&out.indexOf(n)<0)out.push(n)});
  return out;
}
const enc=encodeURIComponent;

// ---- clock ----
idef('alarm_set','clock','set an alarm (Clock app)','hour 0-23, minutes 0-59, label?, days? (1=Sun..7=Sat or mon,tue), skip_ui? (default true)',p=>{
  const ex={};ex[AL_+'HOUR']=iInt(p,'hour',0,23);ex[AL_+'MINUTES']=iInt(p,'minutes',0,59,0);
  const lb=iStr(p,'label',false,60);if(lb)ex[AL_+'MESSAGE']=lb;
  const dy=iDays(p.days);if(dy.length)ex[AL_+'DAYS']=dy;
  ex[AL_+'SKIP_UI']=p.skip_ui!==false;
  return{action:A_+'SET_ALARM',extras:ex};
},{note:'Alarm bhej diya (Clock me dikhna chahiye). App ise confirm nahi kar sakti: verify ke liye alarms_show.'});
idef('alarms_show','clock','open the alarm list','',()=>({action:A_+'SHOW_ALARMS'}));
idef('timer_set','clock','start a countdown timer','seconds 1-86400, label?, skip_ui? (default true)',p=>{
  const ex={};ex[AL_+'LENGTH']=iInt(p,'seconds',1,86400);
  const lb=iStr(p,'label',false,60);if(lb)ex[AL_+'MESSAGE']=lb;
  ex[AL_+'SKIP_UI']=p.skip_ui!==false;
  return{action:A_+'SET_TIMER',extras:ex};
},{note:'Timer bhej diya (Clock me dikhna chahiye). App ise confirm nahi kar sakti: verify ke liye timers_show.'});
idef('timers_show','clock','open the timers','',()=>({action:A_+'SHOW_TIMERS'}));
// ---- calendar ----
idef('calendar_open','calendar','open the Calendar app','',()=>({category:'android.intent.category.APP_CALENDAR'}));
idef('calendar_day','calendar','open Calendar on a day','date? YYYY-MM-DD (default today)',p=>{
  const ms=p.date?iWhen(p.date):Date.now();
  return{action:A_+'VIEW',data:'content://com.android.calendar/time/'+ms};
});
idef('calendar_event_add','calendar','open a new event form (Najeef taps Save)','title, start "YYYY-MM-DD HH:MM", end?, location?, description?, all_day?',p=>{
  const ex={title:iStr(p,'title',true,120)},st=iWhen(p.start);
  if(st===null)throw new Error('start chahiye ("YYYY-MM-DD HH:MM").');
  if(p.all_day){const d=new Date(st);d.setHours(0,0,0,0);ex.beginTime=d.getTime();ex.endTime=d.getTime()+86400000;ex.allDay=true}
  else{ex.beginTime=st;const en=p.end?iWhen(p.end):st+3600000;if(en<st)throw new Error('end start se pehle nahi ho sakta.');ex.endTime=en}
  const lo=iStr(p,'location',false,200),de=iStr(p,'description',false,1000);
  if(lo)ex.eventLocation=lo;if(de)ex.description=de;
  return{action:A_+'INSERT',data:'content://com.android.calendar/events',extras:ex};
},{note:'Event ka form khul gaya: Najeef Save dabayega. Save hua ya nahi, app ko nahi pata.'});
// ---- contacts / phone / mail ----
idef('contacts_open','phone','open the Contacts app','',()=>({category:'android.intent.category.APP_CONTACTS'}));
idef('contact_add','phone','open a new contact form (Najeef taps Save)','name, phone?, email?, company?, notes?',p=>{
  const ex={name:iStr(p,'name',true,80)};
  ['phone','email','company','notes'].forEach(k=>{const v=iStr(p,k,false,200);if(v)ex[k]=v});
  return{action:A_+'INSERT',type:'vnd.android.cursor.dir/contact',extras:ex};
},{note:'Contact ka form khul gaya: Najeef Save dabayega.'});
idef('call_log','phone','open the recent calls list','',()=>({action:A_+'VIEW',type:'vnd.android.cursor.dir/calls'}));
idef('dialer_open','phone','open the dialer (no number)','',()=>({action:A_+'DIAL'}));
idef('email_compose','phone','open an email draft (nothing is sent until he taps Send)','to?, subject?, body?, cc?',p=>{
  const q=[];const su=iStr(p,'subject',false,200),bo=iStr(p,'body',false,3000),cc=iStr(p,'cc',false,200);
  if(su)q.push('subject='+enc(su));if(bo)q.push('body='+enc(bo));if(cc)q.push('cc='+enc(cc));
  return{action:A_+'SENDTO',data:'mailto:'+enc(iStr(p,'to',false,200)).replace(/%40/g,'@').replace(/%2C/g,',')+(q.length?'?'+q.join('&'):'')};
});
idef('email_open','phone','open the Email app','',()=>({category:'android.intent.category.APP_EMAIL'}));
idef('messages_open','phone','open the Messages (SMS) app','',()=>({category:'android.intent.category.APP_MESSAGING'}));
// ---- camera / media ----
idef('camera_open','media','open the camera','',()=>({action:'android.media.action.STILL_IMAGE_CAMERA'}));
idef('camera_photo','media','open the camera in photo mode','',()=>({action:'android.media.action.IMAGE_CAPTURE'}));
idef('camera_video','media','open the camera in video mode','',()=>({action:'android.media.action.VIDEO_CAMERA'}));
idef('gallery_open','media','open the Gallery','',()=>({category:'android.intent.category.APP_GALLERY'}));
idef('music_open','media','open the Music app','',()=>({category:'android.intent.category.APP_MUSIC'}));
idef('music_play','media','play a song or artist from search in the default music app','query',p=>({action:'android.media.action.MEDIA_PLAY_FROM_SEARCH',extras:{query:iStr(p,'query',true,120),'android.intent.extra.focus':'vnd.android.cursor.item/*'}}));
idef('sound_recorder','media','open a voice recorder','',()=>({action:'android.provider.MediaStore.RECORD_SOUND'}));
idef('downloads_open','media','open the Downloads list','',()=>({action:A_+'VIEW_DOWNLOADS'}));
// ---- apps / web / maps / share ----
idef('calculator_open','apps','open the Calculator','',()=>({category:'android.intent.category.APP_CALCULATOR'}));
idef('browser_open','apps','open the default browser','',()=>({category:'android.intent.category.APP_BROWSER'}));
idef('maps_open','apps','open the Maps app','',()=>({category:'android.intent.category.APP_MAPS'}));
idef('maps_search','apps','search a place on the map','query',p=>({action:A_+'VIEW',data:'geo:0,0?q='+enc(iStr(p,'query',true,150))}));
idef('navigate','apps','start navigation to a place','destination, mode? (d car, w walk, b bike, l two-wheeler)',p=>{
  const md=iStr(p,'mode',false,1).toLowerCase()||'d';if(!/^[dwbl]$/.test(md))throw new Error('mode d, w, b ya l hona chahiye.');
  return{action:A_+'VIEW',data:'google.navigation:q='+enc(iStr(p,'destination',true,150))+'&mode='+md};
});
idef('web_search','apps','web search in the browser','query',p=>({action:A_+'WEB_SEARCH',extras:{query:iStr(p,'query',true,200)}}));
idef('share_text','apps','open the share sheet with text (he picks the app)','text, title?',p=>{
  const ex={'android.intent.extra.TEXT':iStr(p,'text',true,5000)},ti=iStr(p,'title',false,120);
  if(ti)ex['android.intent.extra.SUBJECT']=ti;
  return{action:A_+'SEND',type:'text/plain',extras:ex,chooser:true};
},{note:'Share sheet khul gayi: Najeef app chunega, tab tak kuch bheja nahi gaya.'});
idef('playstore_open','apps','open the Play Store','',()=>({category:'android.intent.category.APP_MARKET'}));
idef('playstore_app','apps','open an app page in Play Store','package',p=>({action:A_+'VIEW',data:'market://details?id='+iPkg(p)}));
idef('playstore_search','apps','search the Play Store','query',p=>({action:A_+'VIEW',data:'market://search?q='+enc(iStr(p,'query',true,100))}));
idef('app_info','apps','open the system info page of an app (storage, permissions, force stop)','package',p=>({action:'android.settings.APPLICATION_DETAILS_SETTINGS',data:'package:'+iPkg(p)}));
idef('app_notification_settings','apps','open the notification settings of an app','package',p=>({action:'android.settings.APP_NOTIFICATION_SETTINGS',extras:{'android.provider.extra.APP_PACKAGE':iPkg(p)}}));
// ---- settings pages and quick panels (no params) ----
[['settings_open','android.settings.SETTINGS','main Settings'],
 ['wifi_settings','android.settings.WIFI_SETTINGS','Wi-Fi list'],
 ['bluetooth_settings','android.settings.BLUETOOTH_SETTINGS','Bluetooth'],
 ['airplane_settings','android.settings.AIRPLANE_MODE_SETTINGS','airplane mode'],
 ['network_settings','android.settings.WIRELESS_SETTINGS','network, hotspot, mobile network'],
 ['data_usage_settings','android.settings.DATA_USAGE_SETTINGS','mobile data usage'],
 ['data_roaming_settings','android.settings.DATA_ROAMING_SETTINGS','mobile data / roaming'],
 ['display_settings','android.settings.DISPLAY_SETTINGS','display, brightness, dark mode'],
 ['sound_settings','android.settings.SOUND_SETTINGS','sound, ringtone, do not disturb'],
 ['battery_saver_settings','android.settings.BATTERY_SAVER_SETTINGS','battery saver'],
 ['battery_usage','android.intent.action.POWER_USAGE_SUMMARY','battery usage'],
 ['location_settings','android.settings.LOCATION_SOURCE_SETTINGS','location on/off'],
 ['nfc_settings','android.settings.NFC_SETTINGS','NFC'],
 ['date_settings','android.settings.DATE_SETTINGS','date and time'],
 ['language_settings','android.settings.LOCALE_SETTINGS','language'],
 ['keyboard_settings','android.settings.INPUT_METHOD_SETTINGS','keyboards'],
 ['accessibility_settings','android.settings.ACCESSIBILITY_SETTINGS','accessibility'],
 ['security_settings','android.settings.SECURITY_SETTINGS','security, lock'],
 ['privacy_settings','android.settings.PRIVACY_SETTINGS','privacy'],
 ['apps_settings','android.settings.APPLICATION_SETTINGS','apps list'],
 ['all_apps_settings','android.settings.MANAGE_ALL_APPLICATIONS_SETTINGS','all apps'],
 ['default_apps_settings','android.settings.MANAGE_DEFAULT_APPS_SETTINGS','default apps'],
 ['storage_settings','android.settings.INTERNAL_STORAGE_SETTINGS','storage'],
 ['cast_settings','android.settings.CAST_SETTINGS','cast / screen mirroring'],
 ['vpn_settings','android.net.vpn.SETTINGS','VPN'],
 ['sync_settings','android.settings.SYNC_SETTINGS','accounts and sync'],
 ['about_phone','android.settings.DEVICE_INFO_SETTINGS','about phone'],
 ['developer_settings','android.settings.APPLICATION_DEVELOPMENT_SETTINGS','developer options'],
 ['internet_panel','android.settings.panel.action.INTERNET_CONNECTIVITY','quick panel: Wi-Fi and mobile data toggles'],
 ['wifi_panel','android.settings.panel.action.WIFI','quick panel: Wi-Fi toggle'],
 ['nfc_panel','android.settings.panel.action.NFC','quick panel: NFC toggle'],
 ['volume_panel','android.settings.panel.action.VOLUME','quick panel: volume sliders']
].forEach(x=>idef(x[0],x[0].indexOf('_panel')>0?'panels':'settings',x[2],'',()=>({action:x[1]})));

TOOLS.push(fn('open_intent','Do a phone job through a system intent, with no screen reading (cheaper and surer than screen control): alarms and timers, calendar events, contacts, email drafts, camera, music, maps and navigation, web search, share sheet, Play Store, app info and ~35 settings pages or quick panels (Wi-Fi, Bluetooth, battery, location ...). name is from the list; params as that name needs (rules_read intents shows every name with its params). It opens the app or page; it cannot confirm the final result, so say what you sent, not that it is done. Nothing is called, sent, paid or deleted by an intent.',{name:{type:'string',enum:Object.keys(IN)},params:{type:'object',description:'for example {"hour":6,"minutes":30,"label":"gym"} for alarm_set'},app:{type:'string',description:'optional package to force (com.google.android.deskclock)'}},['name']));

// Builds and checks one intent. Throws Error with a plain message.
function intentSpec(name,params){
  const def=IN[name];
  if(!def)throw new Error('Intent "'+cut(name,30)+'" nahi hai. rules_read intents se naam dekho.');
  const sp=Object.assign({},def.build(params&&typeof params==='object'?params:{}));
  if(sp.category){if(!INT_OK.cats.has(sp.category))throw new Error('category allowed nahi')}
  else{
    if(!INT_OK.actions.has(sp.action))throw new Error('action allowed nahi: '+sp.action);
    if(sp.data){
      const sc=String(sp.data).split(':')[0].toLowerCase();
      if(!INT_OK.schemes.has(sc))throw new Error('data type allowed nahi: '+sc);
      if(sc==='content'&&!INT_OK.contentPrefix.some(x=>String(sp.data).indexOf(x)===0))throw new Error('content link allowed nahi');
    }
    if(sp.type&&!INT_OK.types.has(sp.type))throw new Error('type allowed nahi: '+sp.type);
    Object.keys(sp.extras||{}).forEach(k=>{if(!INT_OK.keys.has(k))throw new Error('extra allowed nahi: '+k)});
  }
  return sp;
}
async function intentStep(s){
  const nm=String(s.name||'').trim(),sp=intentSpec(nm,s.params),app=String(s.app||'').trim();
  const o={action:sp.action||'',data:sp.data||'',type:sp.type||'',category:sp.category||'',extras:sp.extras||{},chooser:!!sp.chooser,pkg:app};
  try{await NI('start',o)}
  catch(e){
    if(app&&e&&e.code==='NOT_FOUND'){o.pkg='';await NI('start',o)}
    else if(e&&e.code==='NOT_FOUND')throw Object.assign(new Error('Is phone me "'+nm+'" ke liye app nahi mila. open_app se uska naam (jaise Clock, Calendar, Calculator) try karo.'),{code:'NOT_FOUND'});
    else throw e;
  }
  await sleep(1200);
  return 'Intent bheja: '+nm+(IN[nm].note?'. '+IN[nm].note:'. Page/app khul gaya.');
}
// Text for the rules area "intents": every name, grouped.
function intentRules(){
  const G={clock:'CLOCK',calendar:'CALENDAR',phone:'CONTACTS, PHONE, MAIL',media:'CAMERA, MEDIA',apps:'APPS, MAPS, WEB, SHARE',settings:'SETTINGS PAGES (no params)',panels:'QUICK PANELS (no params, toggles right there)'};
  let out='INTENTS (open_intent {name, params}: the app starts the right page or app itself, so no screen reading)\n- Prefer open_intent over screen control when a name fits. It only opens the page/app: say what you sent, never that it is finished. If it fails with no app found, use open_app or the screen.\n- A settings page or quick panel gets Najeef to the toggle in one step; then tap_when_visible only if he wants you to flip it.';
  Object.keys(G).forEach(g=>{
    const L=Object.keys(IN).filter(n=>IN[n].g===g);if(!L.length)return;
    out+='\n'+G[g]+': ';
    out+=(g==='settings'||g==='panels')?L.join(', '):L.map(n=>n+(IN[n].p?'('+IN[n].p+')':'')).join('; ');
  });
  return out+'\nDates and times are local, written "YYYY-MM-DD HH:MM". Calendar event and new contact only open the form: he taps Save.';
}
