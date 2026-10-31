function sheet(){
  const b=$('#sbody');
  const ch=S.ch;
  const grp=t=>'<h3 class="grp">'+t+'</h3>';
  const nk=id=>String(S.keys[id]||'').split(',').map(x=>x.trim()).filter(Boolean).length;
  const onoff=v=>'<span class="sb">'+(v?'On':'Off')+'</span>';
  let h='<div class="sec"><h2>Keys import</h2><p class="hint" style="margin:0 0 10px">.json ya .txt file se keys form me bhar jayengi. Save dabane par hi set hongi.</p><button type="button" class="btn ghost" style="margin-top:0" id="imp"><svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>File se keys import karo</button><p class="hint" id="imsg"></p></div>'+grp('Models aur keys')+'<details class="sec"><summary><span class="st">Chaman (apna model)</span></summary><div class="sbd"><label>Space URL</label><input id="c_url" value="'+esc(ch.url)+'" autocapitalize="off"><label>CHAMAN_API_KEY</label><input id="c_key" value="'+esc(ch.key)+'" autocapitalize="off"><label>HF read token</label><input id="c_hf" value="'+esc(ch.hf)+'" autocapitalize="off"></div></details>';
  P.filter(p=>!p.g).forEach(p=>{h+='<details class="sec"><summary><span class="st">'+p.name+'</span>'+(nk(p.id)?'<span class="sb">'+nk(p.id)+(nk(p.id)>1?' keys':' key')+'</span>':'<span class="sb'+(/optional/.test(p.name)?'':' warn')+'">key nahi</span>')+'</summary><div class="sbd"><label>Keys (comma se alag)</label><textarea id="k_'+p.id+'" autocapitalize="off" spellcheck="false">'+esc(S.keys[p.id]||'')+'</textarea><label>Model</label><input id="m_'+p.id+'" value="'+esc(S.models[p.id]||p.model)+'" autocapitalize="off"></div></details>'});
  h+='<details class="sec"><summary><span class="st">Vision (photo samajhne wala model)</span>'+('<span class="sb">'+esc(S.vision.provider)+'</span>')+'</summary><div class="sbd"><label>Provider</label><select id="v_p">'+['nvidia','openrouter','groq','mistral'].map(id=>'<option value="'+id+'">'+P.find(p=>p.id===id).name.replace(' (optional)','')+'</option>').join('')+'</select><label>Model</label><input id="v_m" value="'+esc(S.vision.model)+'" autocapitalize="off"><p class="hint">Photo bhejne par sirf yahi model jawab deta hai. Us provider ki key upar uske section me daalo.</p></div></details>';
  const ic=imgCfg();
  h+='<details class="sec"><summary><span class="st">Image generation (NVIDIA)</span>'+('')+'</summary><div class="sbd"><label>URL (fixed)</label><input value="'+IMG_BASE+'/" readonly><label>Model id (URL ke aage judta hai)</label><input id="im_m" value="'+esc(ic.model)+'" autocapitalize="off" spellcheck="false"><label>Width x Height</label><div style="display:flex;gap:8px"><input id="im_w" type="number" value="'+ic.w+'"><input id="im_h" type="number" value="'+ic.h+'"></div><label>Steps</label><input id="im_s" type="number" value="'+ic.steps+'"><p class="hint">/image kuch bhi likho, ya chat me bolo "image bana do". NVIDIA ki wahi key use hoti hai jo upar NVIDIA section me hai. Image pehle chat me preview aati hai; Save dabane par hi Download folder me jati hai.</p></div></details>';
  h+=grp('AI');
  h+='<details class="sec"><summary><span class="st">System prompt</span>'+('')+'</summary><div class="sbd"><textarea id="sys" style="min-height:130px">'+esc(S.system)+'</textarea><button class="btn ghost" id="rs">Default prompt wapas lao</button></div></details>';
  h+=grp('Phone aur access');
  h+='<details class="sec"><summary><span class="st">Permissions</span></summary><div class="sbd"><p class="hint" style="margin:0 0 10px">Files, Contacts, SMS, Call, System settings, Overlay, Accessibility aur Termux ek-ek card me allow ya skip kar sakte ho. Jo pehle se on hain wo nahi aate.</p><button type="button" class="btn ghost" style="margin-top:0" id="pmr">Permission cards dikhao</button></div></details>';
  h+='<details class="sec"><summary><span class="st">Screen control</span>'+('')+'</summary><div class="sbd"><p class="hint" id="a11s" style="margin:0 0 10px">Check ho raha hai...</p><button type="button" class="btn ghost" style="margin-top:0" id="a11b">Accessibility settings kholo</button><button type="button" class="btn ghost" id="ovb">Display over other apps allow karo</button><button type="button" class="btn ghost" id="ptb">Pill test karo</button><p class="hint">Android 13+ pe pehle Settings > Apps > Chaman > teen dot > Allow restricted settings karo, tab Accessibility on hoti hai. Overlay permission sirf status pill ke liye hai.</p></div></details>';
  h+='<details class="sec"><summary><span class="st">Termux</span>'+('')+'</summary><div class="sbd"><p class="hint" id="tms" style="margin:0 0 10px">Check ho raha hai...</p><button type="button" class="btn ghost" style="margin-top:0" id="tmc">Termux setup line copy karo</button><button type="button" class="btn ghost" id="tmp">Chaman ki permissions kholo</button><p class="hint">Copy ki hui line Termux me paste karke chalao (ek baar). Phir Chaman ki permissions me Additional permissions > Run commands in Termux environment allow karo. Termux F-Droid ya GitHub wala hona chahiye.</p></div></details>';
  h+='<details class="sec"><summary><span class="st">Files (bina Termux)</span>'+('')+'</summary><div class="sbd"><p class="hint" id="fls" style="margin:0 0 10px">Check ho raha hai...</p><button type="button" class="btn ghost" style="margin-top:0" id="flb">All files access allow karo</button><button type="button" class="btn ghost" id="fli">Workspace folders banao</button><p class="hint">AI ke file tools (padhna, likhna, edit, move, delete) /sdcard/Chaman ke andar Termux ke bina chalte hain. Iske liye Chaman ko All files access chahiye. Delete .trash me jata hai, har overwrite/edit se pehle purani copy backup/ me.</p></div></details>';
  h+='<details class="sec"><summary><span class="st">Workspace (/sdcard/Chaman)</span>'+('')+'</summary><div class="sbd"><p class="hint" id="wss" style="margin:0 0 10px">Check ho raha hai...</p><button type="button" class="btn ghost" style="margin-top:0" id="wsb">Workspace banao / check karo</button><label>Auto memory</label><select id="ws_auto"><option value="on">On: kaam ke baad khud note save</option><option value="off">Off</option></select><p class="hint">AI ka apna folder: work/ (uski files), memory/ (har project ki .md memory), backup/ (overwrite se pehle ki copy). Memory aur notes ke liye Termux nahi chahiye, bas Files wali All files access.</p></div></details>';
  h+=(typeof flHtml==='function'?flHtml():'');
  h+=grp('App');
  h+='<details class="sec"><summary><span class="st">Theme</span>'+('')+'</summary><div class="sbd"><select id="th"><option value="auto">System ke hisaab se</option><option value="dark">Dark</option><option value="light">Light</option></select><p class="hint">Provider upar header se badlo ya /provider groq likho. Auto me: NVIDIA, Groq, Cerebras, OpenRouter, Mistral. Key fail ho to agli key, saari fail ho to agla provider.</p></div></details>';
  h+='<details class="sec"><summary><span class="st">Logs (/sdcard/Chaman/logs)</span>'+(onoff(!(S.lg&&S.lg.on===false)))+'</summary><div class="sbd"><p class="hint" id="lgs" style="margin:0 0 10px">Check ho raha hai...</p><label>Log save</label><select id="lg_on"><option value="on">On</option><option value="off">Off</option></select><button type="button" class="btn ghost" id="lgf">Abhi save karo</button><button type="button" class="btn ghost" id="lgc">Aaj ka log copy karo</button><p class="hint">Har din ki ek file (YYYY-MM-DD.md): tere messages, tool calls, Termux commands aur output, confirm allow/cancel, AI ke jawab. Screen ka text aur SMS ka content nahi likhta; typed text aur SMS sirf character count. 30 din baad purani files apne aap hat jati hain. Termux setup zaroori hai.</p></div></details>';
  h+='<details class="sec"><summary><span class="st">Code runner</span>'+(onoff(!(S.rn&&S.rn.on===false)))+'</summary><div class="sbd"><p class="hint" id="rns" style="margin:0 0 10px">Check ho raha hai...</p><label>Runner</label><select id="rn_on"><option value="on">On: AI JavaScript, SQL, Python chala sakta hai</option><option value="off">Off</option></select><label>App khulte hi taiyar rakho</label><select id="rn_warm"><option value="on">On (pehla run turant chalta hai)</option><option value="off">Off (RAM bachti hai)</option></select><label>Internet wali sites (JS fetch ke liye, ek line me ek)</label><textarea id="rn_net" autocapitalize="off" spellcheck="false" placeholder="api.github.com">'+esc(((S.rn&&S.rn.net)||[]).join('\n'))+'</textarea><button type="button" class="btn ghost" id="rnt">Runner test</button><p class="hint" id="rnr"></p><p class="hint">Code app ke andar ek band dabbe me chalta hai: files, phone, screen aur keys tak nahi pahunch sakta. Kuch safe public sites (Wikipedia, Open-Meteo, GitHub API...) pehle se judi hain, baaki sab band hain. Sirf yahan likhi sites par JS fetch chalega (https). Jo site nahi chahiye use hata do.</p></div></details>';
  h+='<p class="hint" style="text-align:center;margin:14px 0 0">Chaman v'+(typeof APP_VER!=='undefined'?APP_VER:'?')+'</p>';
  h+='<div class="savebar"><button class="btn" id="save">Save</button></div>';
  b.innerHTML=h;$('#th').value=S.theme;$('#v_p').value=S.vision.provider;$('#imp').onclick=()=>{kiMode='sheet';$('#ki').click()};
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
  $('#rn_on').value=(S.rn&&S.rn.on===false)?'off':'on';$('#rn_warm').value=(S.rn&&S.rn.warm===false)?'off':'on';
  $('#rns').textContent=typeof rnStatus==='function'?rnStatus():'';
  $('#rnt').onclick=()=>{$('#rnr').textContent='Test chal raha hai...';rnTest().then(t=>{$('#rnr').textContent=t;$('#rns').textContent=rnStatus()}).catch(e=>{$('#rnr').textContent='Test fail: '+errMsg(e)})};
  if(typeof flBind==='function')flBind();
  $('#save').onclick=async()=>{
    // Face lock: a change that makes it weaker needs the owner first. If that fails nothing is saved and the sheet stays open.
    let nfl=null;
    if(typeof flRead==='function'){
      nfl=flRead();
      if(typeof flWeaker==='function'&&flWeaker(flCfg(),nfl)){
        const g=await flGuard();
        if(!g.ok){const e=$('#fls');if(e){e.textContent=g.text;const d=e.closest&&e.closest('details');if(d)d.open=true}return}
      }
    }
    S.ch={url:$('#c_url').value.trim(),key:$('#c_key').value.trim(),hf:$('#c_hf').value.trim()};
    P.filter(p=>!p.g).forEach(p=>{S.keys[p.id]=$('#k_'+p.id).value.trim();const m=$('#m_'+p.id).value.trim();S.models[p.id]=m||p.model});
    S.system=$('#sys').value.trim()||DEF_SYS;S.theme=$('#th').value;S.ws={auto:$('#ws_auto').value!=='off'};S.lg={on:$('#lg_on').value!=='off'};S.rn={on:$('#rn_on').value!=='off',warm:$('#rn_warm').value!=='off',netInit:true,net:$('#rn_net').value.split(/[\n,]+/).map(x=>rnClean(x)).filter(Boolean).slice(0,30)};S.ptr={};S.vision={provider:$('#v_p').value,model:$('#v_m').value.trim()||'openrouter/free'};S.img={model:$('#im_m').value.trim(),w:$('#im_w').value,h:$('#im_h').value,steps:$('#im_s').value};
    if(nfl){S.fl=nfl;flSync()}
    sv('nap_s',S);theme();$('#sheet').classList.remove('open');
  };
}
$('#setb').onclick=()=>{sheet();$('#sheet').classList.add('open')};
$('#closeb').onclick=()=>$('#sheet').classList.remove('open');
let PEND=[];
