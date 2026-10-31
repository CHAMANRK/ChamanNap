// step20: Face lock (FaceLock merged into Chaman). Native plugin `FaceLock` (Kotlin): headless front-camera check, ML Kit + ArcFace.
// Idea: before a sensitive tool runs (areas chosen in Settings > Face lock) the app checks WHO is in front of the camera.
//  owner   -> tool runs, Najeef stays verified for N minutes (default 30), no camera in that time
//  unknown -> tool blocked, phone locked (accessibility), photo saved (if on), 60 s cooldown
//  noface / noblink / unclear / error -> tool blocked, phone NOT locked
// No preview on screen: the status line says what to do ("Blink karo (ek baar)", "Face match 3/5"). Android shows its own green camera dot.
// The AI cannot skip it: faceGate() runs inside execTool0, and the native ScreenControl plugin refuses screen actions without a valid check too.
// App open itself is NOT gated. If no face is enrolled or the model is missing, nothing is gated (nothing to verify against).
// Hardening (19.3.1): verify has a 45 s timeout (+ native cancel); a failing status call or a damaged faces file blocks instead of opening;
// enrolling, deleting faces and weakening the settings need a fresh owner check once a face is enrolled (flGuard).
const FLN=(m,o)=>NPx('FaceLock',m,o);
const FL_AREAS=[
  {id:'screen',t:'Screen control (accessibility)'},
  {id:'termux',t:'Termux (commands, Termux:API)'},
  {id:'files',t:'File tools (padhna, likhna, hatana)'},
  {id:'comms',t:'Call aur SMS'},
  {id:'links',t:'App, link aur intent kholna'},
  {id:'code',t:'Code runner (JS, SQL, Python)'},
  {id:'memory',t:'Memory aur notes'},
  {id:'image',t:'Image generation'},
  {id:'device',t:'Torch, volume, brightness'}
];
const FL_DEF={on:true,min:30,blink:true,strict:0,lock:true,photo:true,areas:['screen','termux']};
function flCfg(){
  const c=Object.assign({},FL_DEF,S.fl||{});
  if(!Array.isArray(c.areas))c.areas=FL_DEF.areas.slice();
  c.min=Math.max(1,Math.min(480,+c.min||30));
  return c;
}
// which area a tool belongs to (null = never gated)
function flArea(name,a){
  if(name==='screen_key'&&a&&a.key==='lock')return null;
  if(/^screen_/.test(name)||/^(ask_user|wait_for_user|tap_when_visible|run_flow|set_switch)$/.test(name))return'screen';
  if(/^termux_/.test(name)||name==='api_check'||name==='device_api')return'termux';
  if((/^file_/.test(name)&&name!=='file_present')||name==='edit_file')return'files';
  if(/^(call|send_sms|read_sms)$/.test(name))return'comms';
  if(/^(open_url|open_intent|open_app)$/.test(name))return'links';
  if(name==='run_code')return'code';
  if(/^(memory_|note_)/.test(name))return'memory';
  if(name==='generate_image')return'image';
  if(/^(torch|set_volume|set_brightness)$/.test(name))return'device';
  return null;
}
function flSync(){
  const c=flCfg();
  return FLN('config',{master:!!c.on,ttlMin:c.min,blink:!!c.blink,strictness:+c.strict||0,lockUnknown:!!c.lock,savePhoto:!!c.photo,areas:c.areas}).catch(()=>{});
}
let FL_BUSY=null,FL_DENY=0,FL_TIMEOUT=45000;
// One check at a time. onProg(text,state) is called with the native status text while the camera runs.
// If the native side never answers (host could not start), after FL_TIMEOUT ms the job is cancelled and the result is error/TIMEOUT.
function flVerify(o,onProg){
  if(FL_BUSY)return FL_BUSY;
  FL_BUSY=(async()=>{
    lnSet('Face check: camera dekh raha hu','run');
    let stop=false,giveUp=null;
    const t0=Date.now();
    const timeout=new Promise(res=>{giveUp=res});
    (async()=>{
      while(!stop){
        if(Date.now()-t0>FL_TIMEOUT){FLN('cancel').catch(()=>{});giveUp({result:'error',code:'TIMEOUT',message:'Face check ka time khatam ho gaya'});return}
        try{const p=await FLN('progress');if(!stop&&p&&p.active&&p.text){lnSet(p.text,p.state||'run');if(onProg)onProg(p.text,p.state||'run')}}catch(e){}
        await sleep(450);
      }
    })();
    try{return await Promise.race([FLN('verify',o||{}),timeout])}
    catch(e){return{result:'error',code:e&&e.code,message:errMsg(e)}}
    finally{stop=true}
  })().then(r=>{FL_BUSY=null;try{flWinSync()}catch(e){}return r},e=>{FL_BUSY=null;throw e});
  return FL_BUSY;
}
const FL_END={
  owner:['Face verify ho gaya','ok'],unknown:['Unknown face mila','fail'],noface:['Face nahi dikha','fail'],
  noblink:['Blink nahi hua','fail'],unclear:['Face saaf nahi dikha','fail'],error:['Face check nahi ho paya','fail']
};
function flFinish(r){
  const e=FL_END[r&&r.result]||FL_END.error;
  lnSet(e[0],e[1]);
  const sc=r&&r.score!=null?' score '+r.score+' (chahiye '+r.threshold+')':'';
  logAdd('face',(r&&r.result||'error')+sc+(r&&r.locked?' | phone lock':'')+(r&&r.photo?' | photo saved':'')+(r&&r.message?' | '+r.message:''));
}
function flUnknownText(r){
  return'Camera ke saamne jo chehra tha wo Najeef ka nahi mila. '+(r.locked?'Phone lock kar diya gaya':'Phone lock nahi ho paya (Accessibility on hai?)')+(r.photo?', photo save ho gayi':'')+'.';
}
// status call failed: in the browser or an APK without the plugin there is nothing to gate (null); on a real Android app block the tool
function flStatusFail(e){
  const m=errMsg(e)||'';
  if(/sirf Android/i.test(m)||(e&&e.code==='UNIMPLEMENTED'))return null;
  return'FACE_ERROR: Face lock ki status nahi padh paya ('+m+'), isliye ye kaam band hai. Najeef Settings > Face lock me is area ko band kar sakta hai.';
}
// returns null = go ahead, or a text for the tool result (the tool does NOT run)
async function faceGate(name,a){
  const area=flArea(name,a);
  if(!area)return null;
  const c=flCfg();
  if(!c.on||c.areas.indexOf(area)<0)return null;
  let st;
  try{st=await FLN('status')}catch(e){return flStatusFail(e)}
  if(!st||!st.modelOk||!(st.enrolled||st.hasData))return null;
  if(st.remainMs>0)return null;
  if(Date.now()-FL_DENY<60000)return'FACE_UNKNOWN: Abhi kuch der pehle unknown face mila tha, isliye ye kaam band hai. Tool dobara mat chalao, Najeef ko batao.';
  const r=await flVerify({grant:true});
  flFinish(r);
  switch(r&&r.result){
    case'owner':return null;
    case'unknown':
      FL_DENY=Date.now();
      return'FACE_UNKNOWN: '+flUnknownText(r)+' Ye kaam NAHI hua. Dobara koi tool mat chalao, sirf Najeef ko batao ki unknown face mila.';
    case'noface':return'FACE_NOT_SEEN: Camera me koi face nahi dikha, isliye "'+name+'" nahi chala. Najeef se kaho camera ke saamne aakar dobara bole. Tool dobara mat chalao.';
    case'noblink':return'FACE_NOT_VERIFIED: Blink check poora nahi hua, isliye "'+name+'" nahi chala. Najeef se kaho camera ki taraf dekh kar ek baar blink kare aur dobara bole.';
    case'unclear':return'FACE_NOT_VERIFIED: Face saaf nahi dikha (roshni ya angle), isliye "'+name+'" nahi chala. Najeef se kaho seedha camera ki taraf dekhe aur dobara bole.';
  }
  const code=r&&r.code;
  if(code==='NOT_ENROLLED')return'FACE_ERROR: Enrolled face data nahi mila ya kharab hai. Najeef Settings > Face lock > Face enroll dobara kare.';
  if(code==='TIMEOUT')return'FACE_ERROR: Face check ka time khatam ho gaya (camera nahi khula). Najeef ko batao, tool dobara mat chalao.';
  if(code==='NO_CAMERA')return'FACE_ERROR: Camera permission nahi hai. Najeef Settings > Face lock me test button se allow kare, ya us area ko Face lock se hata de.';
  return'FACE_ERROR: Face check nahi ho paya ('+((r&&r.message)||code||'error')+'). Najeef Settings > Face lock me is area ko band kar sakta hai.';
}
async function faceWho(a,note,fl){
  const bad=s=>{fl.bad=true;return note(s)};
  let st;
  try{st=await FLN('status')}catch(e){return bad('Face lock sirf Android app me chalta hai.')}
  if(!st.modelOk)return bad('Face model app me nahi hai (APK build me download nahi hua).');
  if(!st.enrolled)return bad('Koi face enroll nahi hai. Najeef Settings > Face lock > Face enroll karo.');
  const r=await flVerify({grant:true,lock:false});
  flFinish(r);
  switch(r&&r.result){
    case'owner':return note('Camera ke saamne Najeef hai (verify ho gaya, score '+r.score+'). Face lock wale kaam ab '+flCfg().min+' minute tak bina dobara check ke chalenge.');
    case'unknown':return bad('Camera ke saamne Najeef nahi hai, koi unknown insaan hai.'+(r.photo?' Photo save ho gayi.':'')+' Phone lock nahi kiya (sirf pooche jaane par).');
    case'noface':return bad('Camera me koi face nahi dikha.');
    case'noblink':return bad('Face dikha par blink check poora nahi hua, pakka nahi keh sakte.');
    case'unclear':return bad('Face saaf nahi dikha (roshni ya angle), pakka nahi keh sakte.');
  }
  return bad('Face check nahi ho paya: '+((r&&r.message)||(r&&r.code)||'error'));
}
if(typeof TOOLS!=='undefined'&&!TOOLS.some(t=>t.function&&t.function.name==='who_is_there'))
  TOOLS.push(fn('who_is_there','Check with the front camera who is in front of the phone right now. Returns whether it is Najeef (owner), an unknown person, or no face. Use it when Najeef asks who is there / to verify him, or when you need to be sure it is him before something sensitive. The camera stays headless (nothing is shown).',{}));
if(typeof LN_LAB!=='undefined')LN_LAB.who_is_there='Face check kar raha hu';

// ---------- Face unlock window: timer chip under the header + "Band karo" button ----------
// Time left comes from native (FaceLock.status().remainMs). JS only ticks the display; flWinSync() re-reads it after every verify,
// at boot and when the app comes back to the front. Band karo = native clearTrust (no face check needed: it only makes the lock stricter).
let FL_WEND=0,FL_WTICK=null;
const flFmt=ms=>{const t=Math.max(0,Math.ceil(ms/1000)),h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60,p=n=>String(n).padStart(2,'0');return h?h+':'+p(m)+':'+p(s):m+':'+p(s)};
function flWinSet(ms){
  const el=$('#flwin');if(!el)return;
  if(FL_WTICK){clearTimeout(FL_WTICK);FL_WTICK=null}
  if(!(ms>0)){FL_WEND=0;el.hidden=true;return}
  FL_WEND=Date.now()+ms;
  if(!el.dataset.b){
    el.innerHTML='<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg><span>Face unlock</span><b id="flwt"></b><button type="button" id="flwoff">Band karo</button>';
    el.dataset.b='1';
    $('#flwoff').onclick=()=>{flWinOff()};
  }
  el.hidden=false;
  const tick=()=>{
    const left=FL_WEND-Date.now();
    if(left<=0){flWinSet(0);flWinSync();return}
    const t=$('#flwt');if(t)t.textContent=flFmt(left);
    FL_WTICK=setTimeout(tick,1000);
  };
  tick();
}
async function flWinSync(){
  try{const st=await FLN('status');flWinSet(st&&st.master!==false&&st.remainMs>0?st.remainMs:0)}
  catch(e){flWinSet(0)}
}
async function flWinOff(){
  try{await FLN('clearTrust')}catch(e){}
  flWinSet(0);
  logAdd('face','window band (button)');
}

// ---------- Owner guard for Settings > Face lock ----------
// Once a face is enrolled, enrolling more faces, deleting faces and making the lock weaker need a fresh owner check
// (camera runs; an unknown face is treated like in the tools: phone lock + photo). Returns {ok:true} or {ok:false,text}.
async function flGuard(){
  let st;
  try{st=await FLN('status')}catch(e){const f=flStatusFail(e);return f?{ok:false,text:f}:{ok:true}}
  if(!st||!st.modelOk||!(st.enrolled>0))return{ok:true};
  const r=await flVerify({grant:true});
  flFinish(r);
  if(r&&r.result==='owner')return{ok:true};
  const why=r&&r.result==='error'?((r.message||r.code||'error')):(FL_END[r&&r.result]||FL_END.error)[0];
  return{ok:false,text:'Owner verify nahi hua ('+why+'). Face enroll, faces hatana aur Face lock ko dheela karna sirf verify ke baad hota hai.'};
}
// true if b (new settings) protects less than a (current)
function flWeaker(a,b){
  if(a.on&&!b.on)return true;
  if(a.areas.some(x=>b.areas.indexOf(x)<0))return true;
  if(b.min>a.min)return true;
  if(a.blink&&!b.blink)return true;
  if(a.lock&&!b.lock)return true;
  if(a.photo&&!b.photo)return true;
  if((+b.strict||0)<(+a.strict||0))return true;
  return false;
}

// ---------- Settings > Face lock ----------
function flHtml(){
  const c=flCfg();
  const sel=(id,opts,val)=>'<select id="'+id+'">'+opts.map(o=>'<option value="'+o[0]+'"'+(String(o[0])===String(val)?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>';
  const onoff=[['on','On'],['off','Off']];
  return'<details class="sec"><summary><span class="st">Face lock</span><span class="sb">'+(c.on?'On':'Off')+'</span></summary><div class="sbd">'
    +'<p class="hint" id="fls" style="margin:0 0 10px">Check ho raha hai...</p>'
    +'<button type="button" class="btn ghost" style="margin-top:0" id="fl_en">Face enroll karo</button>'
    +'<button type="button" class="btn ghost" id="fl_test">Abhi verify karo (test)</button>'
    +'<button type="button" class="btn ghost" id="fl_off">Verify window abhi band karo</button>'
    +'<button type="button" class="btn ghost" id="fl_del">Enrolled faces hatao</button>'
    +'<label>Face lock</label>'+sel('fl_on',onoff,c.on?'on':'off')
    +'<label>Ek verify kitni der valid rahe</label>'+sel('fl_min',[[5,'5 minute'],[15,'15 minute'],[30,'30 minute'],[60,'1 ghanta'],[120,'2 ghante']].concat([5,15,30,60,120].indexOf(c.min)<0?[[c.min,c.min+' minute']]:[]),c.min)
    +'<label>Blink check (status line me "Blink karo" aayega)</label>'+sel('fl_blink',onoff,c.blink?'on':'off')
    +'<label>Strictness</label>'+sel('fl_strict',[[-0.05,'Dheela (-0.05)'],[0,'Normal'],[0.05,'Thoda strict (+0.05)'],[0.1,'Strict (+0.10)']],c.strict)
    +'<label>Unknown face par phone lock</label>'+sel('fl_lock',onoff,c.lock?'on':'off')
    +'<label>Unknown face ki photo save (/sdcard/Chaman/intruder)</label>'+sel('fl_photo',onoff,c.photo?'on':'off')
    +'<label>In kaamon par face check chahiye</label>'
    +FL_AREAS.map(a=>'<label class="flr"><input type="checkbox" id="fl_a_'+a.id+'"'+(c.areas.indexOf(a.id)>=0?' checked':'')+'>'+a.t+'</label>').join('')
    +'<p class="hint">App kholne par face check nahi hota. Face enroll nahi hai ya model nahi hai to koi check nahi lagta. Photo dikhane se ye lock bypass ho sakta hai (anti-spoof nahi hai).</p>'
    +'</div></details>';
}
function flRead(){
  const g=id=>{const e=$('#'+id);return e?e.value:undefined};
  if(g('fl_on')===undefined)return flCfg();
  return{on:g('fl_on')!=='off',min:+g('fl_min')||30,blink:g('fl_blink')!=='off',strict:+g('fl_strict')||0,lock:g('fl_lock')!=='off',photo:g('fl_photo')!=='off',
    areas:FL_AREAS.filter(a=>{const e=$('#fl_a_'+a.id);return e&&e.checked}).map(a=>a.id)};
}
async function flStatusText(){
  try{
    const s=await FLN('status');
    if(!s.modelOk)return'Face model app me nahi mila (CI me scripts/fetch-face-model.sh chalna chahiye).';
    return'Enrolled samples: '+s.enrolled+'. Camera permission: '+(s.camera?'on':'off')+'. Face lock abhi: '+(s.active?'lagu':'nahi (face enroll karo)')+'. Verify valid: '+(s.remainMs>0?Math.ceil(s.remainMs/60000)+' min baaki':'nahi')+'.'+(s.lastUnknownAt?' Aakhri unknown face: '+new Date(s.lastUnknownAt).toLocaleString()+'.':'');
  }catch(e){return'Ye sirf Android app me chalta hai.'}
}
function flBind(){
  const T=t=>{const e=$('#fls');if(e)e.textContent=t};
  const refresh=()=>flStatusText().then(T);
  $('#fl_en').onclick=async()=>{
    try{
      const p=await FLN('checkPermissions');
      if(!p||p.camera!=='granted')await FLN('requestPermissions',{permissions:['camera']});
      T('Owner check chal raha hai...');
      const g=await flGuard();
      if(!g.ok){T(g.text);return}
      await FLN('enroll');
      T('Enroll screen khul gayi.');
    }catch(e){T('Enroll nahi khula: '+errMsg(e))}
  };
  $('#fl_test').onclick=async()=>{
    try{
      const p=await FLN('checkPermissions');
      if(!p||p.camera!=='granted'){const q=await FLN('requestPermissions',{permissions:['camera']});if(!q||q.camera!=='granted'){T('Camera permission allow karo, phir dobara test karo.');return}}
      await flSync();
      T('Test chal raha hai: camera ki taraf dekho...');
      const r=await flVerify({grant:false,lock:false,photo:false},(t)=>T(t));
      const m={owner:'Verify ho gaya',unknown:'Unknown face (aap ke face se match nahi hua)',noface:'Face nahi dikha',noblink:'Blink check poora nahi hua',unclear:'Face saaf nahi dikha',error:'Fail: '+((r&&r.message)||'')}[r&&r.result]||'Fail';
      T(m+(r&&r.score!=null?'. Score '+r.score+' (chahiye '+r.threshold+')':'')+'.');
    }catch(e){T('Test fail: '+errMsg(e))}
  };
  $('#fl_off').onclick=async()=>{await flWinOff();refresh()};
  let armed=0;
  $('#fl_del').onclick=()=>{
    const b=$('#fl_del');
    if(!armed){armed=1;b.textContent='Pakka hatao? Dobara tap karo';setTimeout(()=>{armed=0;b.textContent='Enrolled faces hatao'},4000);return}
    armed=0;b.textContent='Enrolled faces hatao';
    T('Owner check chal raha hai...');
    flGuard().then(g=>{if(!g.ok){T(g.text);return}return FLN('clearFaces').then(()=>{flWinSet(0)}).then(refresh)}).catch(e=>T(errMsg(e)));
  };
  refresh();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&$('#fls'))refresh()});
}
setTimeout(()=>{try{flSync()}catch(e){}},700);
setTimeout(()=>{try{flWinSync()}catch(e){}},900);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)flWinSync()});
