function sheet(){
  const b=$('#sbody');
  const ch=S.ch;
  const grp=t=>'<h3 class="grp">'+t+'</h3>';
  const nk=id=>String(S.keys[id]||'').split(',').map(x=>x.trim()).filter(Boolean).length;
  const onoff=v=>'<span class="sb">'+(v?'On':'Off')+'</span>';
  let h=grp('Models aur keys')+'<details class="sec"><summary><span class="st">Keys import (file se)</span></summary><div class="sbd"><p class="hint" style="margin:0 0 10px">.json ya .txt file se keys form me bhar jayengi. Save dabane par hi set hongi.</p><button type="button" class="btn ghost" style="margin-top:0" id="imp"><svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>File se keys import karo</button><p class="hint" id="imsg"></p></div></details>'+'<details class="sec"><summary><span class="st">Chaman (apna model)</span></summary><div class="sbd"><label>Space URL</label><input id="c_url" value="'+esc(ch.url)+'" autocapitalize="off"><label>CHAMAN_API_KEY</label><input id="c_key" value="'+esc(ch.key)+'" autocapitalize="off"><label>HF read token</label><input id="c_hf" value="'+esc(ch.hf)+'" autocapitalize="off"></div></details>';
  P.filter(p=>!p.g).forEach(p=>{h+='<details class="sec"><summary><span class="st">'+p.name+'</span>'+(nk(p.id)?'<span class="sb">'+nk(p.id)+(nk(p.id)>1?' keys':' key')+'</span>':'<span class="sb'+(/optional/.test(p.name)?'':' warn')+'">key nahi</span>')+'</summary><div class="sbd"><label>Keys (comma se alag)</label><textarea id="k_'+p.id+'" autocapitalize="off" spellcheck="false">'+esc(S.keys[p.id]||'')+'</textarea><label>Model</label><input id="m_'+p.id+'" value="'+esc(S.models[p.id]||p.model)+'" autocapitalize="off"></div></details>'});
  h+='<details class="sec"><summary><span class="st">Vision (photo samajhne wala model)</span>'+('<span class="sb">'+esc(S.vision.provider)+'</span>')+'</summary><div class="sbd"><label>Provider</label><select id="v_p">'+['deepseek','nvidia','openrouter','groq','mistral'].map(id=>'<option value="'+id+'">'+P.find(p=>p.id===id).name.replace(' (optional)','')+'</option>').join('')+'</select><label>Model</label><input id="v_m" value="'+esc(S.vision.model)+'" autocapitalize="off"><p class="hint">Photo bhejne par sirf yahi model jawab deta hai. Us provider ki key upar uske section me daalo.</p></div></details>';
  const ic=imgCfg();
  h+='<details class="sec"><summary><span class="st">Image generation (NVIDIA)</span>'+('')+'</summary><div class="sbd"><label>URL (fixed)</label><input value="'+IMG_BASE+'/" readonly><label>Model id (URL ke aage judta hai)</label><input id="im_m" value="'+esc(ic.model)+'" autocapitalize="off" spellcheck="false"><label>Width x Height</label><div style="display:flex;gap:8px"><input id="im_w" type="number" value="'+ic.w+'"><input id="im_h" type="number" value="'+ic.h+'"></div><label>Steps</label><input id="im_s" type="number" value="'+ic.steps+'"><p class="hint">/image kuch bhi likho, ya chat me bolo "image bana do". NVIDIA ki wahi key use hoti hai jo upar NVIDIA section me hai. Image pehle chat me preview aati hai; Save dabane par hi Download folder me jati hai.</p></div></details>';
  h+=grp('AI');
  h+='<details class="sec"><summary><span class="st">Provider</span><span class="sb">'+esc(provName(S.prov||'auto'))+'</span></summary><div class="sbd"><label>Kaun sa provider chale</label><select id="prov_s">'+['auto'].concat(P.map(p=>p.id)).map(id=>'<option value="'+id+'">'+esc(provName(id))+'</option>').join('')+'</select><p class="hint">Auto me: NVIDIA, Groq, Cerebras, OpenRouter, Mistral. Key fail ho to agli key, saari fail ho to agla provider. Jaldi badalne ke liye composer ka provider chip ya /provider groq.</p></div></details>';
  h+='<details class="sec"><summary><span class="st">System prompt</span>'+('')+'</summary><div class="sbd"><textarea id="sys" style="min-height:130px">'+esc(S.system)+'</textarea><button class="btn ghost" id="rs">Default prompt wapas lao</button></div></details>';
  h+=grp('Phone aur access');
  h+='<details class="sec"><summary><span class="st">Permissions</span></summary><div class="sbd"><p class="hint" style="margin:0 0 10px">Files, Contacts, SMS, Call, System settings, Overlay, Accessibility aur Termux ek-ek card me allow ya skip kar sakte ho. Jo pehle se on hain wo nahi aate.</p><button type="button" class="btn ghost" style="margin-top:0" id="pmr">Permission cards dikhao</button></div></details>';
  h+='<details class="sec"><summary><span class="st">Screen control</span>'+('')+'</summary><div class="sbd"><p class="hint" id="a11s" style="margin:0 0 10px">Check ho raha hai...</p><button type="button" class="btn ghost" style="margin-top:0" id="a11b">Accessibility settings kholo</button><button type="button" class="btn ghost" id="ovb">Display over other apps allow karo</button><button type="button" class="btn ghost" id="ptb">Pill test karo</button><p class="hint">Android 13+ pe pehle Settings > Apps > Chaman > teen dot > Allow restricted settings karo, tab Accessibility on hoti hai. Overlay permission sirf status pill ke liye hai.</p></div></details>';
  h+='<details class="sec"><summary><span class="st">Floating Chaman</span>'+onoff(typeof bubOn==='function'&&bubOn())+'</summary><div class="sbd"><p class="hint" style="margin:0 0 10px">Chhota halka icon jo doosre apps ke upar rehta hai (left beech me, drag kar sakte ho). Tap karo to mini panel: message likho, jawab dekho, confirm card pe Allow/Cancel. 5 sec kuch na ho to panel gayab aur icon 25% dim. Chaman app khula ho to icon nahi dikhta. Screen control (Accessibility) on honi chahiye, aur Overlay permission mil jaye to behtar.</p><label>Floating Chaman</label><select id="bub_on"><option value="off">Off</option><option value="on">On</option></select></div></details>';
  h+='<details class="sec"><summary><span class="st">Termux</span>'+('')+'</summary><div class="sbd"><p class="hint" id="tms" style="margin:0 0 10px">Check ho raha hai...</p><button type="button" class="btn ghost" style="margin-top:0" id="tmc">Termux setup line copy karo</button><button type="button" class="btn ghost" id="tmp">Chaman ki permissions kholo</button><p class="hint">Copy ki hui line Termux me paste karke chalao (ek baar). Phir Chaman ki permissions me Additional permissions > Run commands in Termux environment allow karo. Termux F-Droid ya GitHub wala hona chahiye.</p></div></details>';
  h+=(typeof cnSettingsHtml==='function'?cnSettingsHtml():'');
  h+='<details class="sec"><summary><span class="st">Files (bina Termux)</span>'+('')+'</summary><div class="sbd"><p class="hint" id="fls" style="margin:0 0 10px">Check ho raha hai...</p><button type="button" class="btn ghost" style="margin-top:0" id="flb">All files access allow karo</button><button type="button" class="btn ghost" id="fli">Workspace folders banao</button><p class="hint">AI ke file tools (padhna, likhna, edit, move, delete) /sdcard/Chaman ke andar Termux ke bina chalte hain. Iske liye Chaman ko All files access chahiye. Delete .trash me jata hai, har overwrite/edit se pehle purani copy backup/ me.</p></div></details>';
  h+='<details class="sec"><summary><span class="st">Workspace (/sdcard/Chaman)</span>'+('')+'</summary><div class="sbd"><p class="hint" id="wss" style="margin:0 0 10px">Check ho raha hai...</p><button type="button" class="btn ghost" style="margin-top:0" id="wsb">Workspace banao / check karo</button><label>Auto memory</label><select id="ws_auto"><option value="on">On: kaam ke baad khud note save</option><option value="off">Off</option></select><p class="hint">AI ka apna folder: work/ (uski files), memory/ (har project ki .md memory), backup/ (overwrite se pehle ki copy). Memory aur notes ke liye Termux nahi chahiye, bas Files wali All files access.</p></div></details>';
  h+=(typeof flHtml==='function'?flHtml():'');
  h+=grp('App');
  h+='<details class="sec"><summary><span class="st">Theme</span>'+('')+'</summary><div class="sbd"><select id="th"><option value="auto">System ke hisaab se</option><option value="dark">Dark</option><option value="light">Light</option></select><p class="hint">Dark ya light khud chuno, ya system ke hisaab se chalne do.</p></div></details>';
  h+='<details class="sec"><summary><span class="st">Waiting animation</span>'+onoff(typeof cwUser==='function'&&cwUser())+'</summary><div class="sbd"><label>Dots animation</label><select id="an_on"><option value="off">Off (park): saada status line</option><option value="on">On: wait me dots "Chaman" banate hain</option></select><p class="hint">Default off hai. Kaam live cards me dikhta hai, isliye dots ki zarurat nahi. Code park hai, On karne par pehle jaisa chalta hai.</p></div></details>';
  h+='<details class="sec"><summary><span class="st">Logs (/sdcard/Chaman/logs)</span>'+(onoff(!(S.lg&&S.lg.on===false)))+'</summary><div class="sbd"><button type="button" class="btn" id="lgo">Log viewer kholo</button><p class="hint" id="lgs" style="margin:10px 0">Check ho raha hai...</p><label>Log save</label><select id="lg_on"><option value="on">On</option><option value="off">Off</option></select><button type="button" class="btn ghost" id="lgf">Abhi save karo</button><button type="button" class="btn ghost" id="lgc">Aaj ka log copy karo</button><p class="hint">Har din ki ek file (YYYY-MM-DD.md): tere messages, tool calls, Termux commands aur output, confirm allow/cancel, AI ke jawab. Screen ka text aur SMS ka content nahi likhta; typed text aur SMS sirf character count. 30 din baad purani files apne aap hat jati hain. Termux setup zaroori hai.</p></div></details>';
  h+='<details class="sec"><summary><span class="st">Rich UI in chat</span>'+onoff(typeof uiOn==='function'?uiOn():true)+'</summary><div class="sbd"><label>Widgets</label><select id="ui_on"><option value="on">On: buttons, form, table, chart chat me dikhte hain</option><option value="off">Off: sab widget code block ki tarah dikhte hain</option></select><p class="hint">AI ke bheje widget sirf dikhte hain, khud kuch nahi chalate. Tap karne par aapka normal message jata hai.</p></div></details>';
  h+='<details class="sec"><summary><span class="st">Code runner</span>'+(onoff(!(S.rn&&S.rn.on===false)))+'</summary><div class="sbd"><p class="hint" id="rns" style="margin:0 0 10px">Check ho raha hai...</p><label>Runner</label><select id="rn_on"><option value="on">On: AI JavaScript, SQL, Python chala sakta hai</option><option value="off">Off</option></select><label>App khulte hi taiyar rakho</label><select id="rn_warm"><option value="on">On (pehla run turant chalta hai)</option><option value="off">Off (RAM bachti hai)</option></select><label>Internet wali sites (JS fetch ke liye, ek line me ek)</label><textarea id="rn_net" autocapitalize="off" spellcheck="false" placeholder="api.github.com">'+esc(((S.rn&&S.rn.net)||[]).join('\n'))+'</textarea><button type="button" class="btn ghost" id="rnt">Runner test</button><p class="hint" id="rnr"></p><p class="hint">Code app ke andar ek band dabbe me chalta hai: files, phone, screen aur keys tak nahi pahunch sakta. Kuch safe public sites (Wikipedia, Open-Meteo, GitHub API...) pehle se judi hain, baaki sab band hain. Sirf yahan likhi sites par JS fetch chalega (https). Jo site nahi chahiye use hata do.</p></div></details>';
  h+='<p class="hint" style="text-align:center;margin:14px 0 0">Chaman v'+(typeof APP_VER!=='undefined'?APP_VER:'?')+'</p>';
  h+='<div class="savebar"><button class="btn" id="save">Save</button></div>';
  b.innerHTML=h;$('#th').value=S.theme;$('#prov_s').value=S.prov||'auto';$('#prov_s').onchange=()=>{S.prov=$('#prov_s').value;sv('nap_s',S);if(typeof syncProv==='function')syncProv()};$('#an_on').value=(typeof cwUser==='function'&&cwUser())?'on':'off';$('#v_p').value=S.vision.provider;$('#v_p').onchange=()=>{const id=$('#v_p').value,m=$('#v_m'),defs=['openrouter/free','deepseek-flash'].concat(P.map(p=>p.model||'')),cur=m.value.trim();if(!cur||defs.includes(cur))m.value=id==='deepseek'?'deepseek-flash':id==='openrouter'?'openrouter/free':(S.models[id]||(P.find(p=>p.id===id)||{}).model||cur)};$('#imp').onclick=()=>{kiMode='sheet';$('#ki').click()};
  $('#pmr').onclick=()=>{$('#sheet').classList.remove('open');if(typeof pmStart==='function')pmStart(true)};
  $('#rs').onclick=()=>{$('#sys').value=DEF_SYS};
  $('#a11b').onclick=()=>NS('openA11ySettings').catch(()=>{});
  $('#tmc').onclick=()=>copyTxt("grep -q '^allow-external-apps=true' ~/.termux/termux.properties 2>/dev/null || { mkdir -p ~/.termux; echo 'allow-external-apps=true' >> ~/.termux/termux.properties; }; termux-reload-settings; termux-setup-storage").then(()=>{$('#tms').textContent='Line copy ho gayi. Termux me paste karke chalao.'});
  $('#tmp').onclick=()=>NT('openAppInfo').catch(()=>{});
  NT('status').then(r=>{$('#tms').textContent='Termux: '+(r.installed?'installed':'nahi mila')+'. Permission: '+(r.permission?'on':'off')+'.'}).catch(()=>{$('#tms').textContent='Ye sirf Android app me chalta hai.'});
  $('#ovb').onclick=()=>NS('requestOverlay').catch(()=>{});
  $('#lg_on').value=(S.lg&&S.lg.on===false)?'off':'on';
  const lgst=()=>logInfo().then(m=>{$('#lgs').textContent=m}).catch(e=>{$('#lgs').textContent=termuxMsg(e&&e.code)||'Ye sirf Android app me chalta hai.'});
  $('#lgf').onclick=()=>{$('#lgs').textContent='Save ho raha hai...';logFlush(true).then(lgst)};
  $('#lgo').onclick=()=>{if(typeof lgvOpen==='function')lgvOpen()};
  $('#lgc').onclick=()=>logToday().then(t=>copyTxt(t)).then(()=>{$('#lgs').textContent='Aaj ka log copy ho gaya.'}).catch(e=>{$('#lgs').textContent=termuxMsg(e&&e.code)||errMsg(e)});
  lgst();
  const fls=()=>NF('status').then(r=>{$('#fls').textContent='All files access: '+(r.granted?'on':'off')+'. Workspace folder: '+(r.exists?'hai':'abhi nahi bana')+'.'}).catch(()=>{$('#fls').textContent='Ye sirf Android app me chalta hai.'});
  $('#flb').onclick=()=>NF('requestAccess').catch(()=>{});
  $('#fli').onclick=()=>NF('init').then(()=>fls()).catch(e=>{$('#fls').textContent=errMsg(e)});
  fls();
  $('#ws_auto').value=(S.ws&&S.ws.auto===false)?'off':'on';
  $('#wsb').onclick=()=>{$('#wss').textContent='Ban raha hai...';WS_BACKOFF=0;WS_MEM.t=0;wsInfo(true).then(m=>{$('#wss').textContent=m}).catch(e=>{$('#wss').textContent=termuxMsg(e&&e.code)||errMsg(e)})};
  wsInfo(false).then(m=>{$('#wss').textContent=m}).catch(e=>{$('#wss').textContent=termuxMsg(e&&e.code)||'Ye sirf Android app me chalta hai.'});
  $('#ptb').onclick=()=>NS('pill',{text:'Pill test - dikh raha hai?',ttl:5000,state:'wait'}).then(r=>{$('#a11s').textContent=r.ok?'Pill bheja ('+r.type+'). Upar status bar ke neeche dikhna chahiye.':'Pill fail: '+r.err}).catch(e=>{$('#a11s').textContent='Pill fail: '+errMsg(e)});
  NS('status').then(r=>{$('#a11s').textContent='Accessibility: '+(r.a11y?'on':'off')+'. Overlay pill: '+(r.overlay?'on':'off (tab accessibility overlay use hoga)')+'.'}).catch(()=>{$('#a11s').textContent='Ye sirf Android app me chalta hai.'});
  $('#bub_on').value=(typeof bubOn==='function'&&bubOn())?'on':'off';$('#ui_on').value=(typeof uiOn==='function'&&!uiOn())?'off':'on';$('#rn_on').value=(S.rn&&S.rn.on===false)?'off':'on';$('#rn_warm').value=(S.rn&&S.rn.warm===false)?'off':'on';
  $('#rns').textContent=typeof rnStatus==='function'?rnStatus():'';
  $('#rnt').onclick=()=>{$('#rnr').textContent='Test chal raha hai...';rnTest().then(t=>{$('#rnr').textContent=t;$('#rns').textContent=rnStatus()}).catch(e=>{$('#rnr').textContent='Test fail: '+errMsg(e)})};
  if(typeof flBind==='function')flBind();
  if(typeof cnBind==='function')cnBind();
  $('#save').onclick=async()=>{
    // Face lock: a change that makes it weaker needs the owner first. If that fails nothing is saved and the sheet stays open.
    let nfl=null;
    if(typeof flRead==='function'){
      nfl=flRead();
      if(typeof flWeaker==='function'&&flWeaker(flCfg(),nfl)){
        const g=await flGuard();
        if(!g.ok){const e=$('#fls');if(e){e.textContent=g.text;const d=e.closest&&e.closest('details');if(d){d.open=true;spOpen(d)}}return}
      }
    }
    S.ch={url:$('#c_url').value.trim(),key:$('#c_key').value.trim(),hf:$('#c_hf').value.trim()};
    P.filter(p=>!p.g).forEach(p=>{S.keys[p.id]=$('#k_'+p.id).value.trim();const m=$('#m_'+p.id).value.trim();S.models[p.id]=m||p.model});
    S.system=$('#sys').value.trim()||DEF_SYS;S.prov=$('#prov_s').value;S.anim={on:$('#an_on').value==='on'};S.theme=$('#th').value;S.ws={auto:$('#ws_auto').value!=='off'};S.lg={on:$('#lg_on').value!=='off'};S.ui={off:$('#ui_on').value==='off'};S.rn={on:$('#rn_on').value!=='off',warm:$('#rn_warm').value!=='off',netInit:true,netV:2,net:$('#rn_net').value.split(/[\n,]+/).map(x=>rnClean(x)).filter(Boolean).slice(0,30)};S.ptr={};S.vision={provider:$('#v_p').value,model:$('#v_m').value.trim()||'openrouter/free'};S.img={model:$('#im_m').value.trim(),w:$('#im_w').value,h:$('#im_h').value,steps:$('#im_s').value};
    if(nfl){S.fl=nfl;flSync()}
    S.bub={on:$('#bub_on').value==='on'};sv('nap_s',S);if(typeof bubApply==='function')bubApply();theme();if(typeof syncProv==='function')syncProv();spReset();$('#sheet').classList.remove('open');
  };
  try{setUx()}catch(e){}   // looks only: if this ever fails the old cards still work
}
// ---- U1 (1.42000.0): settings = grouped rows. Each old collapsible card keeps its fields (ids, handlers, Save work as before) but becomes a sub-page; the main list shows one row per card. ----
const SP_BACK='<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',SP_X='<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',SP_CH='<svg class="stc" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
function spReset(){
  const b=$('#sbody'),t=$('#sheet header h1'),c=$('#closeb');
  if(b)b.classList.remove('pg');
  if(b&&typeof b.querySelectorAll==='function')b.querySelectorAll('details.spg.on').forEach(d=>d.classList.remove('on'));
  if(t)t.textContent='Settings';if(c){c.innerHTML=SP_X;c.setAttribute('aria-label','Close')}
}
function spOpen(d){
  const b=$('#sbody'),t=$('#sheet header h1'),c=$('#closeb');if(!b||!d)return;
  b.querySelectorAll('details.spg.on').forEach(x=>x.classList.remove('on'));
  d.open=true;d.classList.add('on');b.classList.add('pg');
  const st=d.querySelector('summary .st');if(t)t.textContent=st?st.textContent:'Settings';
  if(c){c.innerHTML=SP_BACK;c.setAttribute('aria-label','Wapas')}
  b.scrollTop=0;
}
function spOpened(){const b=$('#sbody');return !!(b&&b.classList.contains('pg'))}
function setUx(){
  const b=$('#sbody');if(!b)return;
  spReset();
  const kids=Array.prototype.slice.call(b.children);
  const sr=document.createElement('div');sr.className='ssr';
  sr.innerHTML='<input id="sq" type="search" placeholder="Setting dhundho (jaise key, log, theme)" aria-label="Setting dhundho" autocomplete="off" autocapitalize="off" spellcheck="false"><p class="sqe" id="sqe" hidden>Kuch nahi mila.</p>';
  b.insertBefore(sr,b.firstChild);
  let card=null;
  kids.forEach(el=>{
    if(el.classList&&el.classList.contains('grp')){card=null;el.dataset.g='1';return}
    if(el.tagName==='DETAILS'&&el.classList.contains('sec')){
      if(!card){card=document.createElement('div');card.className='grpc';b.insertBefore(card,el)}
      const st=el.querySelector('summary .st'),label=st?st.textContent:'';
      const vals=Array.prototype.map.call(el.querySelectorAll('summary .sb'),x=>x.outerHTML).join('');
      const r=document.createElement('button');r.type='button';r.className='strow';r.dataset.q=(label+' '+el.textContent).toLowerCase();
      r.innerHTML='<span class="stl">'+esc(label)+'</span><span class="stv">'+vals+'</span>'+SP_CH;
      r.onclick=()=>spOpen(el);
      card.appendChild(r);
      el.classList.add('spg');el.open=true;
      return;
    }
    card=null;
  });
  const q=$('#sq');
  q.oninput=()=>{
    const v=q.value.trim().toLowerCase();let any=false;
    b.querySelectorAll('.strow').forEach(r=>{const ok=!v||r.dataset.q.indexOf(v)>=0;r.hidden=!ok;if(ok)any=true});
    b.querySelectorAll('.grpc').forEach(g=>{g.hidden=!g.querySelector('.strow:not([hidden])')});
    b.querySelectorAll('.grp').forEach(h=>{const n=h.nextElementSibling;h.hidden=!!(v&&n&&n.classList.contains('grpc')&&n.hidden)});
    $('#sqe').hidden=!v||any;
  };
}
$('#setb').onclick=()=>{const w=$('#sesw');if(w)w.classList.remove('open');sheet();$('#sheet').classList.add('open')};
$('#closeb').onclick=()=>{if(spOpened())spReset();else $('#sheet').classList.remove('open')};
let PEND=[];
