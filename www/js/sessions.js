// Sessions: every chat is a folder /sdcard/Chaman/sessions/<id>/ (session.md, chats/, uploads/, logs/, modify/).
// A session starts with the first message after New chat or after the app was killed; minimizing keeps it. Old sessions can be opened and continued.
const SES_ROOT=WS_ROOT+'/sessions',SES_IX=SES_ROOT+'/_index.json';
let SES=ld('nap_ses',null);                       // running session {id,t0,title}; id is null/absent until the first message
let SES_T=0,SES_BUSY=false,SES_DIRTY=false,SES_ERR='',SES_IXC=null;
const sesZ=n=>String(n).padStart(2,'0');
function sesNewId(){const d=new Date();return d.getFullYear()+'-'+sesZ(d.getMonth()+1)+'-'+sesZ(d.getDate())+'_'+sesZ(d.getHours())+sesZ(d.getMinutes())+'_'+Math.random().toString(36).slice(2,6).padEnd(4,'0')}
const sesDay=t=>{const d=new Date(t);return d.getFullYear()+'-'+sesZ(d.getMonth()+1)+'-'+sesZ(d.getDate())+' '+sesZ(d.getHours())+':'+sesZ(d.getMinutes())};
const sesTitle=h=>{const u=(h||[]).find(m=>m.role==='user'&&m.content);return u?cut(String(u.content).replace(/\s+/g,' ').trim(),50):''};
// Same trimmed form that persist() keeps in localStorage (no image data, no file bodies).
const sesSnap=h=>h.map(m=>m.role==='user'?Object.assign({},m,{imgs:undefined,files:(m.files||[]).map(a=>({name:a.name,size:a.size,kind:a.kind,path:a.path}))}):m);
function sesEnsure(){
  if(SES&&SES.id)return SES;
  SES={id:sesNewId(),t0:Date.now(),title:''};sv('nap_ses',SES);
  try{sessionStorage.setItem('nap_sid',SES.id)}catch(e){}
  return SES;
}
function sesMd(s,h){
  const o=['# '+(s.title||'Session'),'','Session: '+s.id,''];
  h.forEach(m=>{
    if(m.role==='user')o.push('**Najeef:** '+(m.content||'')+((m.files||[]).length?'\n[files: '+m.files.map(a=>a.name+(a.path?' -> '+a.path.replace(WS_ROOT+'/',''):'')).join(', ')+']':''),'');
    else if(!m.confirm)o.push('**'+(m.by||'Chaman')+':** '+(m.content||''),'');
  });
  return o.join('\n');
}
// Writes the three session files (no backup/ copies) and the index entry for session s with messages h. Never throws.
async function sesWrite(s,h,ended){
  if(!s||!s.id||!h.some(m=>m.role==='user'))return;
  const d=SES_ROOT+'/'+s.id,snap=sesSnap(h),t1=Date.now();
  if(!s.title)s.title=sesTitle(h);
  try{
    await NF('write',{path:d+'/chats/chat.json',content:JSON.stringify(snap),backup:false});
    await NF('write',{path:d+'/chats/chat.md',content:sesMd(s,h),backup:false});
    await NF('write',{path:d+'/session.md',content:'# '+(s.title||'Session')+'\n- id: '+s.id+'\n- start: '+sesDay(s.t0)+'\n- last: '+sesDay(t1)+'\n- messages: '+h.length+'\n- status: '+(ended?'ended':'running')+'\n- chat: chats/chat.json (app ke Sessions list se continue hota hai)\n- uploads/ logs/ modify/: is session ki files\n',backup:false});
    await sesIndex({id:s.id,title:s.title||'(bina naam)',t0:s.t0,t1,n:h.length,end:!!ended});
    SES_ERR='';
  }catch(e){SES_ERR=e&&e.code==='NO_ACCESS'?'All files access nahi hai':errMsg(e)}
}
async function sesIxLoad(){
  if(SES_IXC)return SES_IXC;
  let a=[];
  try{const r=await NF('read',{path:SES_IX,start:1,max:100000,maxBytes:2000000});a=JSON.parse(r.text||'[]');if(!Array.isArray(a))a=[]}catch(e){if(!(e&&e.code==='NOT_FOUND'))throw e}
  return SES_IXC=a;
}
async function sesIndex(e){
  const a=await sesIxLoad(),i=a.findIndex(x=>x.id===e.id);
  if(i>=0)a[i]=Object.assign(a[i],e);else a.unshift(e);
  a.sort((x,y)=>y.t1-x.t1);
  await NF('write',{path:SES_IX,content:JSON.stringify(a),backup:false});
}
function sesSaveSoon(){
  if(!SES||!SES.id){if(H.some(m=>m.role==='user'))sesEnsure();else return}
  SES_DIRTY=true;clearTimeout(SES_T);SES_T=setTimeout(sesSave,1500);
}
async function sesSave(){
  clearTimeout(SES_T);
  if(SES_BUSY||!SES||!SES.id)return;
  SES_BUSY=true;
  try{while(SES_DIRTY&&SES&&SES.id){SES_DIRTY=false;await sesWrite(SES,H,false)}}finally{SES_BUSY=false}
}
// Final save of the running session (status ended), used before New chat or before opening another session.
async function sesFinish(){
  clearTimeout(SES_T);SES_DIRTY=false;
  while(SES_BUSY)await sleep(50);
  if(SES&&SES.id){await sesWrite(SES,H,true);logAdd('session','Session band: '+SES.id);logFlush()}
}
function sesClear(){H=[];sv('nap_h',H);SES=null;sv('nap_ses',null);try{sessionStorage.removeItem('nap_sid')}catch(e){}SES_DIRTY=false}
async function sesNew(){
  if(busy)return;
  if(!H.length)return;
  await sesFinish();sesClear();render();
}
async function sesOpen(id){
  if(busy)return;
  const e=(await sesIxLoad().catch(()=>[])).find(x=>x.id===id);
  let h;
  try{
    const r=await NF('read',{path:SES_ROOT+'/'+id+'/chats/chat.json',start:1,max:100000,maxBytes:6000000});
    h=JSON.parse(r.text);if(!Array.isArray(h))throw new Error('chat.json sahi nahi hai');
  }catch(err){return 'Session nahi khula: '+(err&&err.code==='NOT_FOUND'?'chat.json nahi mili':errMsg(err))}
  if(SES&&SES.id===id)return '';
  await sesFinish();
  h.forEach(m=>{if(m.confirm&&m.confirm.state==='pending')m.confirm.state='expired'});
  H=h;SES={id,t0:e?e.t0:Date.now(),title:e?e.title:sesTitle(h)};sv('nap_ses',SES);
  try{sessionStorage.setItem('nap_sid',id)}catch(x){}
  persist();render();logAdd('session','Session continue: '+id);
  return '';
}
// Folder change list for the running session: which file the AI wrote, edited or moved (old copies are in backup/).
const SES_CH=/^(file_write|edit_file|termux_write_file|file_move)$/;
function sesChange(name,a){
  if(!SES_CH.test(name)||!SES||!SES.id)return;
  const d=new Date(),p=name==='file_move'?String(a.from||'')+' -> '+String(a.to||''):String(a.path||'');
  NF('append',{path:SES_ROOT+'/'+SES.id+'/modify/changes.md',content:'- '+sesZ(d.getHours())+':'+sesZ(d.getMinutes())+':'+sesZ(d.getSeconds())+' '+name+' '+cut(p,200)+'\n'}).catch(()=>{});
}
// ---- Sessions list (header button) ----
async function sesList(){
  const w=$('#sesw'),l=$('#sesl');w.classList.add('open');l.innerHTML='<div class="sesm">Padh raha hu...</div>';
  try{
    SES_IXC=null;const a=await sesIxLoad();
    if(!a.length){l.innerHTML='<div class="sesm">Abhi koi session save nahi hai. Pehla message bhejte hi session ban jayega.</div>';return}
    l.innerHTML=a.map(x=>'<button type="button" class="sesr'+(SES&&SES.id===x.id?' cur':'')+'" data-id="'+esc(x.id)+'"><b>'+esc(x.title||'(bina naam)')+'</b><span>'+esc(sesDay(x.t1))+' | '+x.n+' msg'+(SES&&SES.id===x.id?' | chal raha hai':'')+'</span></button>').join('');
  }catch(e){l.innerHTML='<div class="sesm">Sessions nahi padhe: '+esc(e&&e.code==='NO_ACCESS'?'All files access nahi hai (Settings > Files me allow karo).':errMsg(e))+'</div>'}
}
function sesBoot(){
  let sid=null;try{sid=sessionStorage.getItem('nap_sid')}catch(e){}
  if(SES&&SES.id&&sid===SES.id)return;              // same app run (page reload): the session goes on
  // App was killed (or first run of this version): save the old chat as its own session and start fresh.
  const oh=H.slice(),os=SES&&SES.id?SES:(oh.some(m=>m.role==='user')?{id:sesNewId(),t0:Date.now(),title:''}:null);
  sesClear();
  if(os&&oh.some(m=>m.role==='user'))sesWrite(os,oh,true);
}
{
  const _p=persist;persist=function(){_p.apply(this,arguments);sesSaveSoon()};
  sesBoot();
  $('#newb').onclick=sesNew;
  $('#sesb').onclick=sesList;
  $('#sesx').onclick=()=>$('#sesw').classList.remove('open');
  $('#sesl').addEventListener('click',async e=>{
    const b=e.target.closest('.sesr');if(!b)return;
    const m=await sesOpen(b.dataset.id);
    if(m){$('#sesl').insertAdjacentHTML('afterbegin','<div class="sesm">'+esc(m)+'</div>');return}
    $('#sesw').classList.remove('open');
  });
  if(typeof document.addEventListener==='function')document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')sesSave()});
}
