// Step19: permission cards. After the keys card (first launch, or when a new permission was added in an update) the app shows ONE card per
// missing permission: Allow / Skip. Status is re-checked when Najeef comes back from Android settings, so a granted card moves on by itself.
// Cards only appear for permissions whose status the app can read (so nothing shows in a plain browser). Skipped ones are not asked again
// automatically; Settings > Permissions shows them again.
const PM_KEY='nap_perm';let PM_RUN=false;
const pmRt=(aliases)=>({st:()=>NP('checkPermissions').then(r=>aliases.every(a=>r&&r[a]==='granted')),ask:()=>NP('requestPermissions',{permissions:aliases}),runtime:true});
const PERMS=[
  Object.assign({id:'files',t:'All files access',why:'AI ka workspace /sdcard/Chaman, attach ki hui files aur Download me image save karne ke liye.',btn:'Allow karo'},{st:()=>NF('status').then(r=>!!r.granted),ask:()=>NF('requestAccess')}),
  Object.assign({id:'contacts',t:'Contacts',why:'"Ammi ko call karo" jaise kaam ke liye naam se number dhoondhne ke liye.',btn:'Allow karo'},pmRt(['contacts'])),
  Object.assign({id:'sms',t:'SMS padhna aur bhejna',why:'AI tumhare kehne par SMS padh aur bhej sake. Bhejne se pehle har baar confirm card aata hai.',btn:'Allow karo'},pmRt(['smsRead','smsSend'])),
  Object.assign({id:'call',t:'Call karna',why:'Call seedha lag jaye, dialer me number dobara na daalna pade. Call se pehle confirm card aata hai.',btn:'Allow karo'},pmRt(['call'])),
  {id:'wsettings',t:'System settings badalna',why:'Brightness jaise settings AI badal sake.',btn:'Settings kholo',st:()=>NP('specialStatus').then(r=>!!r.writeSettings),ask:()=>NP('requestWriteSettings')},
  {id:'overlay',t:'Display over other apps',why:'Upar status pill dikhane ke liye (AI kya kar raha hai).',btn:'Settings kholo',st:()=>NS('status').then(r=>!!r.overlay),ask:()=>NS('requestOverlay')},
  {id:'a11y',t:'Accessibility (screen control)',why:'AI screen padh aur tap kar sake. Android 13+ pe pehle Settings > Apps > Chaman > teen dot > Allow restricted settings karo, phir yahan Chaman ko on karo.',btn:'Accessibility kholo',st:()=>NS('status').then(r=>!!r.a11y),ask:()=>NS('openA11ySettings')},
  {id:'termux',t:'Termux commands',why:'AI Termux me command chala sake. Termux (F-Droid ya GitHub wala) install hona chahiye. Phir Chaman ki permissions > Additional permissions > Run commands in Termux environment allow karo.',btn:'Chaman ki permissions kholo',st:()=>NT('status').then(r=>!!(r.installed&&r.permission)),ask:()=>NT('openAppInfo')}
];
// Permissions that are off now. force=true ignores earlier Skip / Done answers.
async function pmPending(force){
  const seen=force?{}:ld(PM_KEY,{}),out=[];
  for(const p of PERMS){
    if(seen[p.id])continue;
    let ok;try{ok=await p.st()}catch(e){continue}
    if(!ok)out.push(p);
  }
  return out;
}
function pmShow(list,i,seen){
  const m=$('#modal'),c=$('#mcard');
  if(i>=list.length){m.classList.remove('open');PM_RUN=false;return}
  const p=list[i];m.classList.add('open');
  c.innerHTML='<div class="pmstep">Permission '+(i+1)+' / '+list.length+'</div><h2>'+esc(p.t)+'</h2><p>'+esc(p.why)+'</p><p class="hint" id="pmst">Abhi: band</p><button type="button" class="btn" id="pmgo">'+esc(p.btn||'Allow karo')+'</button><button type="button" class="btn ghost" id="pmskip">Skip</button>'+(list.length-i>1?'<button type="button" class="pmall" id="pmall">Baaki sab skip karo</button>':'');
  let done=false,tm=0,denied=false;
  const mark=v=>{seen[p.id]=v;sv(PM_KEY,seen)};
  const next=()=>{if(done)return;done=true;clearInterval(tm);document.removeEventListener('visibilitychange',onVis);pmShow(list,i+1,seen)};
  const check=async()=>{
    if(done)return;let ok=false;
    try{ok=await p.st()}catch(e){}
    if(done||!ok)return;
    done=true;clearInterval(tm);document.removeEventListener('visibilitychange',onVis);
    mark('done');const s=$('#pmst');if(s)s.textContent='Ho gaya \u2713';
    setTimeout(()=>pmShow(list,i+1,seen),700);
  };
  const onVis=()=>{if(!document.hidden)check()};
  document.addEventListener('visibilitychange',onVis);
  tm=setInterval(check,1500);
  $('#pmgo').onclick=async()=>{
    const st=$('#pmst');
    try{
      if(denied){await NT('openAppInfo');st.textContent='App settings me Permissions > '+p.t+' allow karke wapas aao.';return}
      await p.ask();
    }catch(e){st.textContent='Nahi khula: '+errMsg(e);return}
    if(p.runtime){
      let ok=false;try{ok=await p.st()}catch(e){}
      if(!ok){denied=true;st.textContent='Allow nahi hua. Agar Android popup nahi dikha raha to App settings kholo.';$('#pmgo').textContent='App settings kholo'}
      else check();
    }else st.textContent='Settings me allow karke wapas aao, yahan khud aage badh jayega.';
  };
  $('#pmskip').onclick=()=>{mark('skip');next()};
  const all=$('#pmall');
  if(all)all.onclick=()=>{list.slice(i).forEach(x=>{seen[x.id]='skip'});sv(PM_KEY,seen);done=true;clearInterval(tm);document.removeEventListener('visibilitychange',onVis);m.classList.remove('open');PM_RUN=false};
}
async function pmStart(force){
  if(PM_RUN)return;
  const go=async()=>{
    if(PM_RUN)return;PM_RUN=true;
    let list=[];try{list=await pmPending(force)}catch(e){}
    if(!list.length){PM_RUN=false;return}
    pmShow(list,0,force?{}:ld(PM_KEY,{}));
  };
  const m=$('#modal');
  if(m.classList.contains('open')){
    const mo=new MutationObserver(()=>{if(!m.classList.contains('open')){mo.disconnect();go()}});
    mo.observe(m,{attributes:true,attributeFilter:['class']});return;
  }
  go();
}
setTimeout(()=>pmStart(false),600);
