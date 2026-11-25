// 1.50000.0 chaman-link, Nap side: generic connector engine (CONNECTOR.md contract v2; Task 3, C1 + C2).
// RULE: no app name, package or action is written anywhere in this file. Everything comes from the manifest the app sends.
//  C1: discovery (native Link.discover) + handshake (what 1 -> 101 manifest) + validate + cache + Connector screen (Settings) + fake apps for debug.
//  C2: generic call (what 2 -> 102 ACK, 103 PROGRESS, 104 RESULT) + result card + /App commands + app_call tool + AI context of the chosen app only.
// Protocol numbers: 1 HANDSHAKE, 101 MANIFEST, 2 CALL, 102 ACK, 103 PROGRESS, 104 RESULT, 3 PING, 105 PONG.
const CN_LV=1;
const CN_KEY='nap_cn';
const CN_DIR=WS_ROOT+'/connector';
const NL=(m,o)=>NPx('Link',m,o);
let CN=ld(CN_KEY,{});
CN.linked=CN.linked||{};CN.allow=CN.allow||{};CN.fake=CN.fake||{};CN.man=CN.man||{};CN.seen=CN.seen||{};CN.chosen=CN.chosen||'';
const cnSave=()=>sv(CN_KEY,CN);
const CNR={found:[],w:{},calls:{},pumping:false,fakeMs:40};
const CNCONF={};

// ---------- manifest: validate + clean copy ----------
const CN_PT=['string','number','boolean','enum'];
function cnValidate(m){
  if(!m||typeof m!=='object'||Array.isArray(m))return'manifest object nahi hai';
  if(typeof m.link_version!=='number')return'link_version nahi hai';
  if(m.link_version>CN_LV)return'Is app ka link_version '+m.link_version+' hai, Nap sirf '+CN_LV+' tak samajhta hai. Nap update karo.';
  for(const k of['id','naam','package','version'])if(typeof m[k]!=='string'||!m[k].trim())return k+' nahi hai';
  if(!/^[a-z0-9_-]{1,32}$/.test(m.id))return'id galat (sirf a-z 0-9 _ -, max 32)';
  if(!Array.isArray(m.actions)||!m.actions.length)return'actions list nahi hai';
  if(!Array.isArray(m.tools))return'tools list nahi hai';
  const names=[];
  for(const a of m.actions){
    if(!a||typeof a.name!=='string'||!/^[a-z0-9_]{1,40}$/.test(a.name))return'action ka name galat (a-z 0-9 _)';
    if(names.indexOf(a.name)>=0)return'action "'+a.name+'" do baar hai';
    names.push(a.name);
  }
  for(const t of m.tools){
    if(!t||names.indexOf(t.action)<0)return'tool ka action actions me nahi hai: '+(t&&t.action);
    if(t.mode!=null&&t.mode!=='background'&&t.mode!=='open_app')return'tool mode galat ('+t.action+')';
    if(t.result!=null&&['text','file','data'].indexOf(t.result)<0)return'tool result galat ('+t.action+')';
    const ps=t.params==null?{}:t.params;
    if(typeof ps!=='object'||Array.isArray(ps))return'params object nahi hai ('+t.action+')';
    for(const k of Object.keys(ps)){
      const p=ps[k];
      if(!/^[A-Za-z0-9_]{1,40}$/.test(k))return'param naam galat: '+k;
      if(!p||CN_PT.indexOf(p.type)<0)return'param type galat ('+t.action+'.'+k+')';
      if(p.type==='enum'&&(!Array.isArray(p.values)||!p.values.length))return'enum ke values nahi ('+t.action+'.'+k+')';
    }
  }
  return'';
}
function cnNorm(m){
  const s=(v,n)=>String(v==null?'':v).slice(0,n);
  const o={link_version:m.link_version,id:s(m.id,32),naam:s(m.naam,60),package:s(m.package,200),version:s(m.version,40),one_liner:s(m.one_liner,160),
    keywords:Array.isArray(m.keywords)?m.keywords.slice(0,20).map(x=>s(x,30)):[],
    actions:m.actions.map(a=>({name:a.name,desc:s(a.desc,200)})),
    tools:m.tools.map(t=>{
      const ps={};
      Object.keys(t.params||{}).forEach(k=>{const p=t.params[k];ps[k]={type:p.type,required:!!p.required,values:p.type==='enum'?p.values.map(x=>s(x,60)):undefined,desc:s(p.desc,120)}});
      return{action:t.action,params:ps,mode:t.mode==='open_app'?'open_app':'background',result:t.result||'text'};
    }),
    github_release_url:s(m.github_release_url,300)};
  return o;
}
const cnKey=m=>m._fake?'fake:'+m.id:m.package;
const cnLinkedMans=()=>Object.keys(CN.man).filter(id=>CN.linked[id]&&CN.man[id]).map(id=>CN.man[id]);
const cnToolOf=(m,a)=>m.tools.find(t=>t.action===a)||{action:a,params:{},mode:'background',result:'text'};

// ---------- manifest cache file (/sdcard/Chaman/connector/{id}.json), silent if the workspace is not ready ----------
function cnCacheFile(m){try{NF('write',{path:CN_DIR+'/'+m.id+'.json',content:JSON.stringify(m,null,1),backup:false}).catch(()=>{})}catch(e){}}

// ---------- transport: real (native Link) or fake (debug apps) ----------
async function cnSend(key,what,obj){
  if(key.indexOf('fake:')===0)return cnFakeSend(key,what,obj);
  await NL('send',{pkg:key,what,json:JSON.stringify(obj||{})});
}
async function cnSendRetry(man,what,obj){
  try{return await cnSend(cnKey(man),what,obj)}
  catch(e){
    if(man._fake||!(e&&e.code==='NOT_BOUND'))throw e;
    await NL('bind',{pkg:man.package,svc:man._svc});      // the app process was killed: bind again, once
    return await cnSend(cnKey(man),what,obj);
  }
}
function cnWait(k,ms){
  return new Promise(res=>{
    const t=setTimeout(()=>{delete CNR.w[k];res(null)},ms);
    CNR.w[k]=v=>{clearTimeout(t);delete CNR.w[k];res(v)};
  });
}
function cnHandle(it){
  let o={};try{o=JSON.parse(it.json||'{}')||{}}catch(e){o={}}
  const key=it.pkg,w=CNR.w;
  if(it.what===101){if(w['man:'+key])w['man:'+key](o)}
  else if(it.what===102){if(w['ack:'+o.callId])w['ack:'+o.callId](o)}
  else if(it.what===103){const c=CNR.calls[o.callId];if(c)c.onProgress(o)}
  else if(it.what===104){const c=CNR.calls[o.callId];if(c)c.onResult(o)}
  else if(it.what===105){if(w['pong:'+key])w['pong:'+key](o)}
  else if(it.what===-1||it.what===-2){
    Object.keys(CNR.calls).forEach(id=>{const c=CNR.calls[id];if(c.key===key)c.onResult({status:'failed',error:'connection_lost',text:'App se connection toot gaya (app band ho gaya ya crash hua).'})});
  }
}
// One loop drains the native queue (long poll) while something is waiting. It stops by itself when nothing waits.
async function cnPump(){
  if(CNR.pumping)return;
  CNR.pumping=true;
  let bad=0;
  try{
    while(Object.keys(CNR.w).length||Object.keys(CNR.calls).length){
      let r;
      try{r=await NL('poll',{wait:20000});bad=0}catch(e){if(++bad>=3)break;await sleep(400);continue}
      ((r&&r.items)||[]).forEach(cnHandle);
    }
  }finally{CNR.pumping=false}
}
// fake apps (Settings > Connector > debug): same protocol, answered here, so the engine can be tested without a real app
function cnFakeSend(key,what,obj){
  const id=key.slice(5),m=CN.fake[id],ms=CNR.fakeMs,put=(w,o,d)=>setTimeout(()=>cnHandle({pkg:key,what:w,json:JSON.stringify(o)}),d);
  if(!m)throw Object.assign(new Error('Fake app nahi mila'),{code:'NOT_BOUND'});
  if(what===1)put(101,m,ms);
  else if(what===3)put(105,{version:m.version},ms);
  else if(what===2){
    const id2=obj.callId,act=m.actions.find(a=>a.name===obj.action);
    if(/^reject_me$/.test(obj.action)){put(102,{callId:id2,accepted:false,error:'rejected_by_fake'},ms);return}
    put(102,{callId:id2,accepted:true},ms);
    if(!act){put(104,{callId:id2,status:'failed',error:'unknown_action',text:'unknown_action'},ms*2);return}
    const t=cnToolOf(m,obj.action),ps=JSON.stringify(obj.params||{});
    put(103,{callId:id2,percent:25,text:'shuru'},ms*2);put(103,{callId:id2,percent:70,text:'beech me'},ms*3);
    if(ps.indexOf('FAIL')>=0){put(104,{callId:id2,status:'failed',error:'fake_fail',text:'Fake fail (param me FAIL tha)'},ms*4);return}
    const res={callId:id2,status:'done',text:'fake ok: '+obj.action+' '+ps};
    if(t.result==='file')res.files=['/sdcard/Chaman/fake/'+m.id+'.txt'];
    if(t.result==='data')res.data={action:obj.action,params:obj.params||{}};
    put(104,res,ms*4);
  }
}

// ---------- discovery, link, unlink ----------
async function cnScan(){
  let real=[];
  try{real=((await NL('discover')).apps)||[]}catch(e){real=[]}
  const byPkg={};Object.keys(CN.man).forEach(id=>{const m=CN.man[id];if(m&&!m._fake)byPkg[m.package]=m});
  const L=real.map(a=>({key:a.pkg,pkg:a.pkg,svc:a.svc,label:a.label||a.pkg,version:a.version||'',sigOk:!!a.sigOk,fake:false,man:byPkg[a.pkg]||null}));
  Object.keys(CN.fake).forEach(id=>{const m=CN.fake[id];L.push({key:'fake:'+id,pkg:'fake:'+id,svc:'',label:m.naam,version:m.version,sigOk:true,fake:true,man:CN.man[id]&&CN.man[id]._fake?CN.man[id]:null,fid:id})});
  L.forEach(f=>{f.status=cnStatus(f)});
  CNR.found=L;
  return L;
}
function cnStatus(f){
  const m=f.man;
  if(!f.fake&&!f.sigOk)return'Not linked';
  if(!m||!CN.linked[m.id])return'Not linked';
  const seen=CN.seen[m.id];
  if(!f.fake&&f.version&&seen&&f.version!==seen)return'Update available';
  return'Linked';
}
async function cnLink(f){
  if(!f.fake&&!f.sigOk)throw new Error('Ye app alag key se sign hai (master key nahi). Pehle usse master key se rebuild karo.');
  let raw;
  if(f.fake){const p=cnWait('man:'+f.key,5000);cnPump();await cnSend(f.key,1,{link_version:CN_LV});raw=await p}
  else{
    await NL('bind',{pkg:f.pkg,svc:f.svc});
    const p=cnWait('man:'+f.key,8000);cnPump();
    await cnSend(f.key,1,{link_version:CN_LV});
    raw=await p;
  }
  if(!raw)throw new Error('App ne manifest nahi bheja (8 sec)');
  const err=cnValidate(raw);if(err)throw new Error('Manifest galat: '+err);
  const m=cnNorm(raw);
  if(!f.fake&&m.package!==f.pkg)throw new Error('Manifest ka package ('+m.package+') is app se match nahi karta ('+f.pkg+')');
  if(f.fake)m._fake=true;else{m._pkg=f.pkg;m._svc=f.svc}
  const old=CN.man[m.id];
  if(old&&old.package!==m.package&&!f.fake)throw new Error('id "'+m.id+'" pehle kisi aur app ka hai ('+old.package+')');
  CN.man[m.id]=m;CN.linked[m.id]=true;CN.seen[m.id]=f.version||m.version;cnSave();cnCacheFile(m);
  logAdd('connector','linked '+m.id+' v'+m.version+(old&&old.version!==m.version?' (manifest refresh)':''));
  return m;
}
function cnUnlink(id){
  const m=CN.man[id];if(!m)return false;
  CN.linked[id]=false;if(CN.chosen===id)CN.chosen='';cnSave();
  if(!m._fake)NL('unbind',{pkg:m.package}).catch(()=>{});
  logAdd('connector','unlinked '+id);
  return true;
}
function cnRemoveFake(id){delete CN.fake[id];if(CN.man[id]&&CN.man[id]._fake){delete CN.man[id];delete CN.linked[id];delete CN.seen[id];if(CN.chosen===id)CN.chosen=''}cnSave()}
function cnAddFake(txt){
  let raw;try{raw=JSON.parse(txt)}catch(e){throw new Error('JSON galat: '+e.message)}
  const err=cnValidate(raw);if(err)throw new Error('Manifest galat: '+err);
  const m=cnNorm(raw);
  if(CN.man[m.id]&&!CN.man[m.id]._fake)throw new Error('id "'+m.id+'" asli app ka hai, doosra id lo');
  CN.fake[m.id]=m;cnSave();return m;
}
// the manifest is refreshed only when the installed version changed (seen at link time) or the app is not cached
async function cnFresh(f){
  if(f.man&&cnStatus(f)==='Linked')return f.man;
  if(f.man&&CN.linked[f.man.id]&&cnStatus(f)==='Update available')return await cnLink(f);
  return null;
}

// ---------- params ----------
function cnParams(tool,raw){
  const spec=(tool&&tool.params)||{},out={};
  raw=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const names=Object.keys(spec);
  for(const k of Object.keys(raw))if(!spec[k])return{err:'Param "'+k+'" is action me nahi hai. Params: '+(names.join(', ')||'koi nahi')};
  for(const k of names){
    const s=spec[k];let v=raw[k];
    if(v===undefined||v===null||v===''){if(s.required)return{err:'Param "'+k+'" zaroori hai'};continue}
    if(s.type==='number'){v=typeof v==='number'?v:Number(String(v).trim());if(!isFinite(v))return{err:'Param "'+k+'" number hona chahiye'}}
    else if(s.type==='boolean'){
      if(typeof v==='string'){const t=v.trim().toLowerCase();if(/^(true|yes|haan|1|on)$/.test(t))v=true;else if(/^(false|no|nahi|0|off)$/.test(t))v=false;else return{err:'Param "'+k+'" true ya false hona chahiye'}}
      else v=!!v;
    }
    else if(s.type==='enum'){v=String(v);if((s.values||[]).indexOf(v)<0)return{err:'Param "'+k+'" in me se ek ho: '+(s.values||[]).join(', ')}}
    else v=String(v).slice(0,4000);
    out[k]=v;
  }
  return{params:out};
}
const cnParamLine=t=>{const ks=Object.keys(t.params||{});return ks.length?ks.map(k=>{const p=t.params[k];return k+' ('+p.type+(p.type==='enum'?': '+p.values.join('|'):'')+(p.required?', required':'')+')'}).join(', '):'no params'};

// ---------- result card ----------
let CN_RT=0;
function cnRender(){
  if(CN_RT)return;
  CN_RT=setTimeout(()=>{CN_RT=0;render()},250);
}
function cnBar(p){const n=Math.max(0,Math.min(10,Math.round(p/10)));return'`['+'#'.repeat(n)+'-'.repeat(10-n)+'] '+Math.round(p)+'%`'}
function cnCardText(m){
  const c=m.cn,L=['**'+(m.by||c.id)+'** > '+c.action];
  const st=c.state==='run'?'Chal raha hai':c.state==='done'?'Ho gaya':c.state==='failed'?'Fail':'Pata nahi (app dobara khula)';
  L.push(st+(c.mode==='open_app'&&c.state==='run'?' (app khulega)':''));
  if(c.state==='run'&&typeof c.pct==='number')L.push(cnBar(c.pct));
  if(c.text)L.push(String(c.text).slice(0,1500));
  if(c.error&&c.state==='failed'&&String(c.text||'').indexOf(c.error)<0)L.push('Error: '+c.error);
  if(c.files&&c.files.length)L.push(c.files.slice(0,10).map(f=>'- `'+String(typeof f==='string'?f:(f&&(f.path||f.name))||'').slice(0,200)+'`').join('\n'));
  if(c.data!=null){let j='';try{j=JSON.stringify(c.data,null,1)}catch(e){j=String(c.data)}L.push('```json\n'+noFence(j.slice(0,1200))+'\n```')}
  m.content=L.join('\n');
  m.aiNote='App kaam ('+c.id+' '+c.action+'): '+c.state+(c.text?' - '+String(c.text).slice(0,200):'')+(c.files&&c.files.length?' | files: '+c.files.length:'');
}
function cnFinish(card,r){
  const c=card.cn;
  c.state=r.status==='done'?'done':'failed';c.pct=null;
  c.text=r.text==null?'':String(r.text);c.error=r.error?String(r.error):'';
  c.files=Array.isArray(r.files)?r.files.slice(0,20):[];c.data=r.data&&typeof r.data==='object'&&Object.keys(r.data).length?r.data:null;
  cnCardText(card);persist();render();
  logAdd(c.state==='done'?'tool':'tool FAIL','app '+c.id+' '+c.action+' -> '+c.state+(c.error?' ('+c.error+')':''));
}

// ---------- confirm: Allow once | Always Allow | Deny (the card is the normal confirm card, clicks handled in phone.js) ----------
function cnConfirm(man,act,tool,params){
  return new Promise(res=>{
    const id='k'+Date.now()+Math.random().toString(36).slice(2,6);
    CNCONF[id]=res;
    const body=Object.keys(params).map(k=>k+': '+cut(String(params[k]),300)).join('\n')||'(koi param nahi)';
    logAdd('confirm?',man.id+' '+act.name+': '+cut(body,200));
    H.push({role:'assistant',by:'Apps',local:1,content:man.naam+' me kaam chalana hai: '+act.name+':\n```\n'+noFence(body)+'\n```\nWajah: '+cut(act.desc||'App ka action',120)+(tool.mode==='open_app'?' (ye app khulega)':''),confirm:{type:'cn',id,opts:[{name:'Once'},{name:'Always'}],state:'pending',lab:'Allow'}});
    render();
    setTimeout(()=>{
      if(!CNCONF[id])return;
      delete CNCONF[id];
      const mm=H.find(x=>x.confirm&&x.confirm.id===id);
      if(mm&&mm.confirm.state==='pending'){mm.confirm.state='expired';mm.content+='\n\nTime khatam, cancel.'}
      logAdd('confirm','app expired (deny)');render();res('deny');
    },180000);
  });
}

// ---------- the generic call ----------
// o.wait = ms to wait for the RESULT (0: return right after the ACK, the card keeps updating by itself)
async function cnCall(man,action,params,o){
  o=o||{};
  const act=man.actions.find(a=>a.name===action);
  if(!act)return{ok:false,err:'unknown_action',text:'Action "'+action+'" nahi hai. Actions: '+man.actions.map(a=>a.name).join(', ')};
  const tool=cnToolOf(man,action),pv=cnParams(tool,params);
  if(pv.err)return{ok:false,err:'bad_params',text:pv.err};
  if(!CN.allow[man.id+':'+action]){
    const d=await cnConfirm(man,act,tool,pv.params);
    if(d==='deny')return{ok:false,err:'denied',text:'Najeef ne deny kiya (ya time khatam).'};
    if(d==='always'){CN.allow[man.id+':'+action]=true;cnSave()}
  }
  const key=cnKey(man),callId='c'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const card={role:'assistant',by:man.naam,local:1,cn:{id:man.id,action,callId,state:'run',pct:null,text:'Bhej raha hu...',mode:tool.mode,result:tool.result}};
  cnCardText(card);H.push(card);render();
  let settle;const done=new Promise(r=>{settle=r});
  let fin=false;
  const end=r=>{if(fin)return;fin=true;clearTimeout(tm);delete CNR.calls[callId];cnFinish(card,r);settle(r)};
  const tm=setTimeout(()=>end({status:'failed',error:'timeout',text:'Result time par nahi aaya (30 min). App me check karo.'}),30*60*1000);
  CNR.calls[callId]={key,onProgress:p=>{if(fin)return;if(typeof p.percent==='number')card.cn.pct=Math.max(0,Math.min(100,p.percent));if(p.text!=null)card.cn.text=String(p.text);cnCardText(card);cnRender()},onResult:end};
  const ackP=cnWait('ack:'+callId,8000);cnPump();
  try{await cnSendRetry(man,2,{callId,action,params:pv.params})}
  catch(e){const r={status:'failed',error:(e&&e.code)||'send_fail',text:'App tak CALL nahi gaya: '+errMsg(e)};end(r);return{ok:false,err:r.error,text:r.text,card}}
  const ack=await ackP;
  if(!ack){const r={status:'failed',error:'no_ack',text:'App ne ACK nahi diya (8 sec).'};end(r);return{ok:false,err:'no_ack',text:r.text,card}}
  if(ack.accepted===false){const r={status:'failed',error:String(ack.error||'rejected'),text:'App ne kaam nahi liya: '+String(ack.error||'rejected')};end(r);return{ok:false,err:r.error,text:r.text,card}}
  if(o.wait>0){
    const r=await Promise.race([done,sleep(o.wait).then(()=>null)]);
    if(r)return{ok:r.status==='done',err:r.error,text:r.text||'',files:r.files,data:r.data,card};
  }
  return{ok:true,running:!fin,text:'',card};
}
// AI tool: only the app Najeef chose
const cnOn=()=>!!(CN.chosen&&CN.linked[CN.chosen]&&CN.man[CN.chosen]);
TOOLS.push(fn('app_call','Run an action of the linked app Najeef chose with /App (see CONNECTED APP in your instructions). app_id and action must be exactly from there, params as that action needs. Najeef taps a confirm card first. The job runs in the background (the app does not open); a result card shows in the chat and you get the result, or "still running" if it takes longer than wait_s. Never call it for an app that is not chosen, never invent actions or params.',{app_id:{type:'string'},action:{type:'string'},params:{type:'object'},wait_s:{type:'integer',minimum:0,maximum:300,description:'seconds to wait for the result, default 60'}},['app_id','action']));
async function cnTool(a,note,fl){
  const bad=s=>{fl.bad=true;return note(s)};
  if(!cnOn())return bad('Koi app chuna nahi gaya. Najeef ko /App se app chunne ko bolo.');
  const id=String(a.app_id||'');
  if(id!==CN.chosen)return bad('App "'+id+'" chuna nahi gaya. Chuna hua app: '+CN.chosen+'.');
  const man=CN.man[id],w=a.wait_s==null?60:Math.max(0,Math.min(300,+a.wait_s||0));
  let params=a.params;if(typeof params==='string'){try{params=JSON.parse(params)}catch(e){return bad('params JSON galat hai.')}}
  const r=await cnCall(man,String(a.action||''),params||{},{wait:w*1000});
  if(!r.ok){fl.bad=true;return note('App kaam fail: '+(r.err||'')+' '+(r.text||''))+(r.err==='denied'?' Dobara mat chalao, Najeef se pucho.':'')}
  if(r.running)return note('App ne kaam le liya, abhi chal raha hai.')+' Chat me result card live update hota hai. Dobara mat chalao; Najeef ko batao ki card dekhe.';
  return note('App kaam ho gaya: '+man.naam+' '+a.action)+'\n'+(r.text||'')+(r.files&&r.files.length?'\nfiles: '+r.files.slice(0,10).map(f=>typeof f==='string'?f:(f.path||f.name)).join(', '):'')+(r.data?'\ndata: '+cut(JSON.stringify(r.data),1500):'');
}

// ---------- AI context: only the chosen app ----------
function cnBlock(){
  if(!cnOn())return'';
  const m=CN.man[CN.chosen];
  const acts=m.actions.map(a=>{const t=cnToolOf(m,a.name);return'- '+a.name+(a.desc?': '+a.desc:'')+'. params: '+cnParamLine(t)+'. mode '+t.mode+', result '+t.result}).join('\n');
  return'\n\nCONNECTED APP (Najeef chose it with /App): '+m.naam+' (app_id "'+m.id+'")'+(m.one_liner?' - '+m.one_liner:'')+'\nUse the app_call tool: app_call(app_id, action, params). Najeef taps a confirm card first, the app runs it in the background and a result card shows in the chat. Actions of this app:\n'+acts+'\nOnly these actions and params exist. Do not call any other app. Do not claim it worked before app_call returns done.';
}
const cnRules=()=>RULES.apps+(cnOn()?cnBlock():'\n(Abhi koi app chuna nahi gaya.)')+'\nLinked apps: '+(cnLinkedMans().map(m=>m.naam+' ('+m.id+')').join(', ')||'koi nahi');

// ---------- /App ----------
function cnFind(q){
  q=String(q||'').toLowerCase().trim();
  const mine=CNR.found.filter(f=>f.man&&CN.linked[f.man.id]&&cnStatus(f)!=='Not linked');
  const hit=(f,eq)=>{const m=f.man||{},ns=[(m.id||''),(m.naam||''),f.label||''].map(x=>x.toLowerCase());return eq?ns.some(x=>x===q):ns.some(x=>x.indexOf(q)>=0)};
  let h=mine.filter(f=>hit(f,true));if(!h.length)h=mine.filter(f=>hit(f,false));
  const other=CNR.found.filter(f=>mine.indexOf(f)<0&&((f.label||'').toLowerCase().indexOf(q)>=0||(f.man&&f.man.id.indexOf(q)>=0)||(f.pkg||'').toLowerCase().indexOf(q)>=0));
  return{hits:h,other};
}
function cnParse(man,rest){
  rest=String(rest||'').trim();
  const names=man.actions.map(a=>a.name),first=(rest.split(/\s+/)[0]||'').toLowerCase();
  let action,txt;
  if(names.indexOf(first)>=0){action=first;txt=rest.slice(first.length).trim()}
  else if(names.length===1){action=names[0];txt=rest}
  else return{err:'Kaam samajh nahi aaya. Is app ke actions: '+names.join(', ')};
  const tool=cnToolOf(man,action),ks=Object.keys(tool.params||{});
  if(!txt)return{action,params:{}};
  if(txt[0]==='{'){try{return{action,params:JSON.parse(txt)}}catch(e){return{err:'JSON galat hai'}}}
  const pairs=[],re=/(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;let mm;
  while((mm=re.exec(txt)))pairs.push(mm);
  if(pairs.length&&pairs.every(p=>ks.indexOf(p[1])>=0)){const o={};pairs.forEach(p=>{o[p[1]]=p[2]!=null?p[2]:p[3]!=null?p[3]:p[4]});return{action,params:o}}
  if(ks.length===1)return{action,params:{[ks[0]]:txt}};
  const req=ks.filter(k=>tool.params[k].required&&tool.params[k].type==='string');
  if(req.length===1)return{action,params:{[req[0]]:txt}};
  return{err:'Params likho (naam=value). '+action+': '+cnParamLine(tool)};
}
const cnHelpText=()=>{
  const L=['**/App** - linked apps ki list (tap karke chuno)','**/App {name}** - app chuno, uske kaam dekho','**/App {name} {kaam}** - app chuno aur kaam seedha chalao','**/App off** - chuna hua app hatao','**/App help** - ye list'];
  const ms=cnLinkedMans();
  if(ms.length){L.push('','Linked apps:');ms.forEach(m=>{L.push('- **'+m.naam+'** ('+m.id+')'+(m.one_liner?': '+m.one_liner:''));m.actions.forEach(a=>L.push('  - /App '+m.id+' '+a.name+(Object.keys(cnToolOf(m,a.name).params).length?' <'+Object.keys(cnToolOf(m,a.name).params).join('> <')+'>':'')+(a.desc?' : '+a.desc:'')))})}
  else L.push('','Abhi koi app linked nahi hai. /App se list dekho ya Settings > Connector.');
  return L.join('\n');
};
async function cnCmd(arg){
  const say=(c,x)=>H.push(Object.assign({role:'assistant',by:'Apps',info:1,content:c},x||{}));
  arg=String(arg||'').trim();
  await cnScan();
  if(/^help$/i.test(arg)){say(cnHelpText());return}
  if(/^off$/i.test(arg)){CN.chosen='';cnSave();say('Koi app chuna nahi hai ab.');return}
  if(!arg){
    if(!CNR.found.length){say('Koi link-wala app nahi mila.\n\nApp me chaman-link hona chahiye aur Chaman ki hi key se sign. Settings > Connector me dekho.');return}
    say('Apps (tap karke chuno)'+(CN.chosen&&CN.man[CN.chosen]?'\nChuna hua: '+CN.man[CN.chosen].naam:''),{cnlist:CNR.found.map(f=>({key:f.key,name:(f.man&&f.man.naam)||f.label,status:f.status}))});
    return;
  }
  const name=(arg.split(/\s+/)[0]||''),rest=arg.slice(name.length).trim();
  const r=cnFind(name);
  if(r.hits.length>1){say('Kai apps mile, kaun sa?',{cnlist:r.hits.map(f=>({key:f.key,name:f.man.naam,status:f.status,rest}))});return}
  if(!r.hits.length){
    if(r.other.length){say('"'+name+'" abhi linked nahi hai. Link karna hai?',{cnlist:r.other.map(f=>({key:f.key,name:(f.man&&f.man.naam)||f.label,status:f.status}))});return}
    say('"'+name+'" naam ka app nahi mila. /App se list dekho.');return;
  }
  await cnUse(r.hits[0],rest,say);
}
// choose an app (and run the kaam if there is one)
async function cnUse(f,rest,say){
  let man=f.man;
  try{const fr=await cnFresh(f);if(fr)man=fr}catch(e){say('Manifest refresh fail: '+errMsg(e));return}
  if(!man||!CN.linked[man.id]){say('Ye app linked nahi hai.',{cnlist:[{key:f.key,name:f.label,status:f.status}]});return}
  CN.chosen=man.id;cnSave();
  if(!rest){
    say('Chuna: **'+man.naam+'** ('+man.id+')'+(man.one_liner?'\n'+man.one_liner:'')+'\n\n'+man.actions.map(a=>{const t=cnToolOf(man,a.name);return'- **'+a.name+'**'+(a.desc?': '+a.desc:'')+' ('+cnParamLine(t)+')'}).join('\n')+'\n\nKaam: /App '+man.id+' '+man.actions[0].name+' ... ya seedha AI ko bolo.');
    return;
  }
  const p=cnParse(man,rest);
  if(p.err){say(p.err);return}
  const r=await cnCall(man,p.action,p.params,{wait:0});
  if(!r.ok&&!r.card)say('Fail: '+r.text);
}
async function cnLinkUi(key){
  await cnScan();
  const f=CNR.found.find(x=>x.key===key);if(!f)return;
  const m0={role:'assistant',by:'Apps',info:1,content:'Link ho raha hai: '+(f.label)+'...'};H.push(m0);render();
  try{const m=await cnLink(f);m0.content='Linked: **'+m.naam+'** v'+m.version+' ('+m.actions.length+' actions). /App '+m.id+' se chuno.'}
  catch(e){m0.content='Link fail: '+errMsg(e)}
  persist();render();
}
// list rows inside a chat message
function cnH(m,hi){
  if(!m.cnlist)return'';
  return'<div class="acts">'+m.cnlist.map(x=>'<button type="button" class="cnb" data-cn="'+esc(x.key)+'" data-act="'+(x.status==='Not linked'?'link':'pick')+'"'+(x.rest?' data-rest="'+esc(x.rest)+'"':'')+'>'+esc(x.name)+' - '+esc(x.status==='Not linked'?'Link karo':x.status)+'</button>').join('')+'</div>';
}
$('#chat').addEventListener('click',async e=>{
  const b=e.target.closest('.cnb');if(!b)return;
  const key=b.dataset.cn;
  if(b.dataset.act==='link'){await cnLinkUi(key);return}
  await cnScan();
  const f=CNR.found.find(x=>x.key===key);if(!f)return;
  const say=(c,x)=>H.push(Object.assign({role:'assistant',by:'Apps',info:1,content:c},x||{}));
  try{await cnUse(f,b.dataset.rest||'',say)}catch(err){say('Fail: '+errMsg(err))}
  persist();render();
});
SLASH.push({name:'app',hint:'Linked apps: list, chuno, kaam chalao',run:a=>cnCmd(a)});

// ---------- Settings > Connector screen ----------
function cnSettingsHtml(){
  const n=cnLinkedMans().length;
  return'<details class="sec"><summary><span class="st">Connector (linked apps)</span><span class="sb">'+n+' linked</span></summary><div class="sbd"><p class="hint" id="cns" style="margin:0 0 10px">Check ho raha hai...</p><div id="cnl"></div>'
   +'<button type="button" class="btn" id="cnr" style="margin-top:10px">Dobara dhundo</button>'
   +'<label>Debug: fake app (manifest JSON paste karo)</label><textarea id="cn_json" style="min-height:90px" placeholder=\'{"link_version":1,"id":"demo","naam":"Demo","package":"fake.demo","version":"1","actions":[{"name":"hello"}],"tools":[{"action":"hello","params":{"text":{"type":"string","required":true}}}]}\'></textarea>'
   +'<button type="button" class="btn" id="cn_add" style="margin-top:10px">Fake app jodo</button><p class="hint" id="cnd"></p></div></details>';
}
function cnListHtml(){
  if(!CNR.found.length)return'<p class="hint">Koi link-wala app nahi mila. App me chaman-link ho aur Chaman ki hi key se sign ho.</p>';
  return CNR.found.map(f=>{
    const name=(f.man&&f.man.naam)||f.label,st=f.status;
    const btn=st==='Linked'?'<button type="button" class="cnb" data-cn="'+esc(f.key)+'" data-a="unlink">Unlink</button>':'<button type="button" class="cnb" data-cn="'+esc(f.key)+'" data-a="link">'+(st==='Update available'?'Refresh':'Link')+'</button>';
    return'<div class="cnrow"><div class="cnt"><b>'+esc(name)+(f.fake?' (fake)':'')+'</b><small>'+esc(st)+(f.version?' - v'+esc(f.version):'')+(!f.fake&&!f.sigOk?' - alag key se sign':'')+'</small></div>'+btn+(f.fake?'<button type="button" class="cnb x" data-cn="'+esc(f.key)+'" data-a="rm">Hatao</button>':'')+'</div>';
  }).join('');
}
async function cnSettingsRefresh(){
  const l=$('#cnl');if(!l)return;
  await cnScan();
  l.innerHTML=cnListHtml();
  const s=$('#cns');if(s){const n=CNR.found.filter(f=>f.status==='Linked').length;s.textContent=CNR.found.length+' app mile, '+n+' linked.'}
  const sb=document.querySelector('#sbody .strow[data-q^="connector"] .sb');if(sb)sb.textContent=CNR.found.filter(f=>f.status==='Linked').length+' linked';
}
function cnBind(){
  const l=$('#cnl');if(!l)return;
  $('#cnr').onclick=()=>cnSettingsRefresh();
  $('#cn_add').onclick=()=>{
    const d=$('#cnd');
    try{const m=cnAddFake($('#cn_json').value);d.textContent='Fake app jud gaya: '+m.naam+'. Neeche Link dabao.';$('#cn_json').value='';cnSettingsRefresh()}
    catch(e){d.textContent=errMsg(e)}
  };
  l.onclick=async e=>{
    const b=e.target.closest('.cnb');if(!b)return;
    const key=b.dataset.cn,f=CNR.found.find(x=>x.key===key),s=$('#cns');if(!f)return;
    if(b.dataset.a==='rm'){cnRemoveFake(f.fid);await cnSettingsRefresh();return}
    if(b.dataset.a==='unlink'){if(f.man)cnUnlink(f.man.id);await cnSettingsRefresh();return}
    if(s)s.textContent='Link ho raha hai...';
    try{const m=await cnLink(f);if(s)s.textContent='Linked: '+m.naam+' v'+m.version}catch(err){if(s)s.textContent='Link fail: '+errMsg(err)}
    const t=s?s.textContent:'';await cnSettingsRefresh();if(s&&t)s.textContent=t;
  };
  cnSettingsRefresh();
}
// a card that was still running when the app closed will never get its result
function cnInit(){
  let ch=false;
  H.forEach(m=>{if(m.cn&&m.cn.state==='run'&&!CNR.calls[m.cn.callId]){m.cn.state='lost';m.cn.pct=null;cnCardText(m);ch=true}});
  if(ch){persist();render()}
}
try{setTimeout(cnInit,0)}catch(e){}
