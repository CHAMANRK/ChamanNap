// 1.51000.0: update detector. Reads the latest GitHub Release of the public repo (no token), compares its tag with APP_VER,
// and offers the APK link. Install is always done by Najeef (Android needs his tap), so no install permission is added.
// Releases are created by CI only when he pushes a tag of a tested version (see .github/workflows/build.yml).
const UP_REPO='CHAMANRK/Chaman-Nap';
const UP_API='https://api.github.com/repos/'+UP_REPO+'/releases/latest';
const UP_EVERY=6*3600*1000;
const UP={busy:false,info:null};
function upState(){if(!S.up||typeof S.up!=='object')S.up={};return S.up}
// "v1.51000.0" or "1.51000.0" -> [1,51000,0]; anything else -> null
function upParse(v){const m=String(v==null?'':v).trim().replace(/^v/i,'').match(/^(\d+)\.(\d+)\.(\d+)$/);return m?[+m[1],+m[2],+m[3]]:null}
function upCmp(a,b){for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i]?1:-1}return 0}
// only links that point into our own repo are ever opened
function upSafe(u){u=String(u||'');return u.toLowerCase().indexOf('https://github.com/'+UP_REPO.toLowerCase()+'/')===0}
function upPlain(t,n){return String(t==null?'':t).replace(/\r/g,'').replace(/```[a-z0-9]*\n?/gi,'').replace(/[*`#>]+/g,'').replace(/\n{3,}/g,'\n\n').trim().slice(0,n||300)}
// -> {ok:true,newer,tag,ver,name,notes,url,apk} or {ok:false,msg}
async function upFetch(){
  let r;
  try{r=await T(fetch(UP_API,{headers:{'Accept':'application/vnd.github+json'}}),20000)}
  catch(e){return{ok:false,msg:'Internet ya GitHub nahi mila ('+errMsg(e)+').'}}
  if(r.status===404)return{ok:false,msg:'Abhi koi release nahi bani. Tested version pe tag push karo, tab release banegi.'};
  if(r.status===403||r.status===429)return{ok:false,msg:'GitHub ne abhi roka (limit). Thodi der baad try karo.'};
  if(!r.ok)return{ok:false,msg:'GitHub ne HTTP '+r.status+' diya.'};
  let j;try{j=await r.json()}catch(e){return{ok:false,msg:'GitHub ka jawab samajh nahi aaya.'}}
  const tag=String((j&&j.tag_name)||''),rv=upParse(tag),cv=upParse(typeof APP_VER!=='undefined'?APP_VER:'');
  if(!rv)return{ok:false,msg:'Release ka tag ("'+tag.slice(0,30)+'") version jaisa nahi hai (v1.51000.0 jaisa chahiye).'};
  const a=((j.assets)||[]).find(x=>x&&/\.apk$/i.test(String(x.name||''))&&upSafe(x.browser_download_url));
  const url=a?a.browser_download_url:(upSafe(j.html_url)?j.html_url:'');
  return{ok:true,newer:!!cv&&upCmp(rv,cv)>0,tag:tag,ver:rv.join('.'),name:String(j.name||tag).slice(0,60),notes:upPlain(j.body),url:url,apk:!!a};
}
function upModalOpen(){const m=$('#modal');return !!(m&&m.classList&&m.classList.contains&&m.classList.contains('open'))}
function upPopup(info,fake){
  const m=$('#modal'),c=$('#mcard');if(!m||!c)return;
  const st=upState();
  c.innerHTML='<h2>Naya version aaya</h2><p>v'+esc(info.ver)+' (abhi v'+esc(typeof APP_VER!=='undefined'?APP_VER:'?')+')'+(fake?' - TEST popup, asli update nahi':'')+'</p>'
    +(info.notes?'<p class="hint" style="white-space:pre-wrap">'+esc(info.notes)+'</p>':'')
    +'<p class="hint">Download ke baad notification se APK kholo aur Install dabao. Purana app apne aap update hoga.</p>'
    +(info.url?'<button class="btn" id="upd">'+(info.apk?'APK download karo':'Release page kholo')+'</button>':'')
    +'<button class="btn ghost" id="upl">Baad me</button>';
  m.classList.add('open');
  const d=$('#upd');
  if(d)d.onclick=()=>{upOpen(info.url).then(ok=>{if(ok)m.classList.remove('open')})};
  $('#upl').onclick=()=>{if(!fake){st.skip=info.tag;sv('nap_s',S)}m.classList.remove('open')};
}
// opens the link; if no app can open it, the link is copied instead
async function upOpen(url){
  if(!upSafe(url))return false;
  try{await NP('openUrl',{uri:url});return true}
  catch(e){try{await copyTxt(url)}catch(x){}const s=$('#ups');if(s)s.textContent='Link khul nahi paya, copy kar diya: '+url;return false}
}
// manual check (Settings button) and the base of the auto check
async function upCheck(){
  if(UP.busy)return UP.info;
  UP.busy=true;
  try{
    const r=await upFetch(),st=upState();
    UP.info=r;
    if(r.ok){st.last=Date.now();st.seen=r.tag;sv('nap_s',S)}
    return r;
  }finally{UP.busy=false}
}
// app start: at most once per 6 hours, silent on any failure, popup only for a newer tag he has not dismissed
async function upAuto(){
  const st=upState();
  if(st.on===false)return null;
  if(Date.now()-(st.last||0)<UP_EVERY)return null;
  const r=await upCheck();
  if(r&&r.ok&&r.newer&&st.skip!==r.tag&&!upModalOpen())upPopup(r,false);
  return r;
}
function upLine(r){
  const cur=typeof APP_VER!=='undefined'?APP_VER:'?';
  if(!r)return'Abhi v'+cur+'. Check nahi hua.';
  if(!r.ok)return r.msg;
  return r.newer?'Naya version hai: v'+r.ver+' (abhi v'+cur+').':'Tum latest pe ho: v'+cur+' (GitHub pe latest v'+r.ver+').';
}
function upSettingsHtml(){
  const st=upState(),cur=typeof APP_VER!=='undefined'?APP_VER:'?',n=UP.info&&UP.info.ok&&UP.info.newer;
  return'<details class="sec"><summary><span class="st">App update</span><span class="sb'+(n?' warn':'')+'" id="up_sb">'+(n?'naya hai':'v'+esc(cur))+'</span></summary><div class="sbd"><p class="hint" id="ups" style="margin:0 0 10px">'+esc(upLine(UP.info))+'</p>'
   +'<button type="button" class="btn" id="upc" style="margin-top:0">Update check karo</button>'
   +'<button type="button" class="btn ghost" id="upg"'+(n&&UP.info.url?'':' hidden')+'>'+(UP.info&&UP.info.apk?'APK download karo':'Release page kholo')+'</button>'
   +'<label>Auto check (app khulte hi, 6 ghante me ek baar)</label><select id="up_on"><option value="on">On</option><option value="off">Off</option></select>'
   +'<button type="button" class="btn ghost" id="upt">Popup test (nakli naya version)</button>'
   +'<p class="hint">GitHub Releases se check hota hai. Release tab banti hai jab tested version pe tag (v1.51000.0 jaisa) push hota hai. Install tumhe khud karna hota hai.</p></div></details>';
}
function upBind(){
  const b=$('#upc');if(!b)return;
  $('#up_on').value=upState().on===false?'off':'on';
  $('#up_on').onchange=()=>{upState().on=$('#up_on').value!=='off';sv('nap_s',S)};
  const show=r=>{
    $('#ups').textContent=upLine(r);
    const n=!!(r&&r.ok&&r.newer),g=$('#upg');
    $('#up_sb').textContent=n?'naya hai':'v'+(typeof APP_VER!=='undefined'?APP_VER:'?');
    if(g){g.hidden=!(n&&r.url);g.textContent=r&&r.apk?'APK download karo':'Release page kholo'}
  };
  b.onclick=()=>{$('#ups').textContent='Check ho raha hai...';upCheck().then(show).catch(e=>{$('#ups').textContent='Check fail: '+errMsg(e)})};
  $('#upg').onclick=()=>{if(UP.info&&UP.info.url)upOpen(UP.info.url)};
  $('#upt').onclick=()=>{
    const real=UP.info&&UP.info.ok?UP.info:{url:'',apk:false};
    upPopup({ver:'9.99000.0',tag:'v9.99000.0',notes:'Ye sirf popup ka test hai.',url:real.url,apk:real.apk},true);
    $('#sheet').classList.remove('open');
  };
  show(UP.info);
}
setTimeout(()=>{upAuto().catch(()=>{})},3000);
