// Log saving: everything the app does is queued and appended through Termux to the running session's log (/sdcard/Chaman/sessions/<id>/logs/log.md);
// lines made before any session exists go to /sdcard/Chaman/logs/YYYY-MM-DD.md (kept 30 days).
const LOG_ROOT=WS_ROOT+'/logs';
const LOGQ=[];let LOG_BUSY=false,LOG_BACKOFF=0,LOG_PRUNED=false,LOG_ERR='';
const lpad=n=>String(n).padStart(2,'0');
const logClean=s=>String(s==null?'':s).replace(/\b(gsk_|sk-|nvapi-|hf_|csk-)[A-Za-z0-9_-]{16,}/g,'[key]');
// Redacted one-line description of a tool call (no typed text, no SMS text, no file content).
function logTool(name,a){
  a=a||{};
  switch(name){
    case'screen_type':return name+' ('+String(a.text==null?'':a.text).length+' chars'+(a.submit?', enter':'')+')';
    case'send_sms':return name+' to '+cut(a.contact,40)+' ('+String(a.text||'').length+' chars)';
    case'termux_write_file':return name+' '+cut(a.path,120)+' ('+String(a.content==null?'':a.content).length+' chars)';
    case'file_write':return name+' '+cut(a.path,120)+' ('+String(a.content==null?'':a.content).length+' chars)';
    case'edit_file':return name+' '+cut(a.path,120)+' ('+(Array.isArray(a.edits)?a.edits.length:1)+' edits)';
    case'file_search':return name+' '+cut(a.path,80)+' ('+String(a.query||'').length+' chars query)';
    case'termux_run':return name+' (details in termux entry)';
    case'memory_save':return name+' '+cut(a.project,40);
    case'memory_search':return name+' ('+String(a.query||'').length+' chars query)';
    case'note_save':return name+' '+cut(a.name,40)+' ('+String(a.text==null?'':a.text).length+' chars)';
    case'note_get':return name+' '+cut(a.query,40);
    case'open_url':return name+' '+cut(String(a.uri||'').replace(/([?&]text=).*/i,'$1...'),80)+(a.contact?' contact '+cut(a.contact,30):'')+(a.text?' ('+String(a.text).length+' chars)':'');
    case'device_api':return name+' '+cut(a.name,30)+' ['+Object.keys(a.params&&typeof a.params==='object'?a.params:{}).join(',')+']';
    case'api_check':return name;
    case'rule_save':return name+' '+cut(a.name,40)+' ('+String(a.when==null?'':a.when).length+'+'+String(a.steps==null?'':a.steps).length+' chars)';
    case'rule_list':return name;
    case'notify_now':return name+' ('+String(a.title==null?'':a.title).length+'+'+String(a.text==null?'':a.text).length+' chars)';
    case'schedule_ai':return name+' ('+(a.in_minutes!=null?'in '+a.in_minutes+' min':(a.date||'')+' '+(a.time||''))+', '+(a.repeat||'none')+', '+String(a.prompt==null?'':a.prompt).length+' chars)';
    case'schedule_add':return name+' ('+(a.in_minutes!=null?'in '+a.in_minutes+' min':(a.date||'')+' '+(a.time||''))+', '+(a.repeat||'none')+', '+String(a.title==null?'':a.title).length+'+'+String(a.text==null?'':a.text).length+' chars)';
    case'run_code':return name+' '+cut(a.lang,8)+' ('+String(a.code==null?'':a.code).length+' chars'+(a.csv?', csv':'')+(a.db?', db':'')+')';
    case'set_switch':return name+' '+cut(a.text,40)+' '+a.state;
    case'open_intent':return name+' '+cut(a.name,40)+' ['+Object.keys(a.params&&typeof a.params==='object'?a.params:{}).join(',')+']';
    case'run_flow':return name+' ['+(Array.isArray(a.steps)?a.steps.map(s=>s&&s.do).join(','):'')+']';
  }
  const o=Object.assign({},a);delete o.status;
  const j=JSON.stringify(o);
  return name+(j&&j!=='{}'?' '+cut(j,150):'');
}
function logAdd(kind,text,code){
  if(!S.lg||S.lg.on===false)return;
  const d=new Date(),day=d.getFullYear()+'-'+lpad(d.getMonth()+1)+'-'+lpad(d.getDate()),tm=lpad(d.getHours())+':'+lpad(d.getMinutes())+':'+lpad(d.getSeconds());
  const sid=(typeof SES!=='undefined'&&SES&&SES.id)||'';
  let s='- '+(sid?day+' ':'')+tm+' ['+kind+'] '+cut(logClean(text).replace(/\s*\n\s*/g,' | '),600);
  if(code)s+='\n```\n'+noFence(cut(logClean(code),1500))+'\n```';
  LOGQ.push({day,sid,text:s});
  while(LOGQ.length>300)LOGQ.shift();
  if(LOGQ.length>=15)logFlush();
}
async function logFlush(force){
  if(LOG_BUSY||!LOGQ.length||(!force&&Date.now()<LOG_BACKOFF))return;
  LOG_BUSY=true;
  const batch=LOGQ.splice(0,LOGQ.length);
  try{
    const grp={};batch.forEach(e=>{const k=e.sid||('d:'+e.day);(grp[k]=grp[k]||{sid:e.sid||'',day:e.day,t:[]}).t.push(e.text)});
    let cmd='mkdir -p '+LOG_ROOT+' || exit 1; ';
    if(!LOG_PRUNED)cmd+='find '+LOG_ROOT+' -name "*.md" -mtime +30 -delete 2>/dev/null; ';
    for(const k in grp){
      const g=grp[k],dir=g.sid?SES_ROOT+'/'+g.sid+'/logs':LOG_ROOT,f=dir+'/'+(g.sid?'log.md':g.day+'.md');
      cmd+='mkdir -p '+dir+' || exit 1; [ -f '+f+' ] || printf "'+(g.sid?'# Session log':'# Chaman log')+' %s\\n\\n" '+(g.sid||g.day)+' > '+f+'; printf "%s\\n" '+shq(cut(g.t.join('\n'),30000))+' >> '+f+' || exit 1; ';
    }
    cmd+='echo LOGGED';
    const r=await NT('run',{command:cmd,timeout:15});
    if(String(r.stdout||'').indexOf('LOGGED')<0)throw new Error(r.timeout?'Termux ne jawab nahi diya':'log nahi likha (termux-setup-storage?)');
    LOG_PRUNED=true;LOG_ERR='';
  }catch(e){
    LOGQ.unshift(...batch);while(LOGQ.length>300)LOGQ.shift();
    LOG_BACKOFF=Date.now()+120000;LOG_ERR=termuxMsg(e&&e.code)||errMsg(e);
  }
  LOG_BUSY=false;
}
const logFile=()=>typeof SES!=='undefined'&&SES&&SES.id?SES_ROOT+'/'+SES.id+'/logs/log.md':LOG_ROOT+'/$(date +%Y-%m-%d).md';
async function logInfo(){
  const r=await NT('run',{command:'ls '+LOG_ROOT+' 2>/dev/null | wc -l; f='+logFile()+'; if [ -f "$f" ]; then wc -c < "$f"; else echo 0; fi',timeout:10});
  if(r.timeout)return'Termux ne jawab nahi diya.';
  const v=String(r.stdout||'').trim().split(/\s+/);
  return'Log files: '+(v[0]||0)+' din. '+(typeof SES!=='undefined'&&SES&&SES.id?'Is session ka log: ':'Aaj ka log: ')+((+v[1]||0)/1024).toFixed(1)+' KB. Save hona baaki: '+LOGQ.length+(LOG_ERR?'. Pichhli error: '+LOG_ERR:'')+'.';
}
async function logToday(){
  const r=await NT('run',{command:'f='+logFile()+'; if [ -f "$f" ]; then tail -c 30000 "$f"; else echo "Abhi log nahi bana."; fi',timeout:15});
  return String(r.stdout||'');
}
if(typeof document.addEventListener==='function')document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')logFlush()});
