function sheet(){
  const b=$('#sbody');
  const ch=S.ch;
  let h='<div class="sec"><h2>Keys import</h2><p class="hint" style="margin:0 0 10px">.json ya .txt file se keys form me bhar jayengi. Save dabane par hi set hongi.</p><button type="button" class="btn ghost" style="margin-top:0" id="imp"><svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M5 20h14"/></svg>File se keys import karo</button><p class="hint" id="imsg"></p></div><div class="sec"><h2>Chaman (apna model)</h2><label>Space URL</label><input id="c_url" value="'+esc(ch.url)+'" autocapitalize="off"><label>CHAMAN_API_KEY</label><input id="c_key" value="'+esc(ch.key)+'" autocapitalize="off"><label>HF read token</label><input id="c_hf" value="'+esc(ch.hf)+'" autocapitalize="off"></div>';
  P.filter(p=>!p.g).forEach(p=>{h+='<div class="sec"><h2>'+p.name+'</h2><label>Keys (comma se alag)</label><textarea id="k_'+p.id+'" autocapitalize="off" spellcheck="false">'+esc(S.keys[p.id]||'')+'</textarea><label>Model</label><input id="m_'+p.id+'" value="'+esc(S.models[p.id]||p.model)+'" autocapitalize="off"></div>'});
  h+='<div class="sec"><h2>Vision (photo samajhne wala model)</h2><label>Provider</label><select id="v_p">'+['nvidia','openrouter','groq','mistral'].map(id=>'<option value="'+id+'">'+P.find(p=>p.id===id).name.replace(' (optional)','')+'</option>').join('')+'</select><label>Model</label><input id="v_m" value="'+esc(S.vision.model)+'" autocapitalize="off"><p class="hint">Photo bhejne par sirf yahi model jawab deta hai. Us provider ki key upar uske section me daalo.</p></div>';
  h+='<div class="sec"><h2>System prompt</h2><textarea id="sys" style="min-height:130px">'+esc(S.system)+'</textarea><button class="btn ghost" id="rs">Default prompt wapas lao</button></div>';
  h+='<div class="sec"><h2>Theme</h2><select id="th"><option value="auto">System ke hisaab se</option><option value="dark">Dark</option><option value="light">Light</option></select><p class="hint">Provider upar header se badlo ya /provider groq likho. Auto me: Groq, Cerebras, OpenRouter, NVIDIA, Mistral. Key fail ho to agli key, saari fail ho to agla provider.</p></div>';
  h+='<div class="sec"><h2>Screen control</h2><p class="hint" id="a11s" style="margin:0 0 10px">Check ho raha hai...</p><button type="button" class="btn ghost" style="margin-top:0" id="a11b">Accessibility settings kholo</button><button type="button" class="btn ghost" id="ovb">Display over other apps allow karo</button><button type="button" class="btn ghost" id="ptb">Pill test karo</button><p class="hint">Android 13+ pe pehle Settings > Apps > Chaman > teen dot > Allow restricted settings karo, tab Accessibility on hoti hai. Overlay permission sirf status pill ke liye hai.</p></div>';
  h+='<div class="sec"><h2>Termux</h2><p class="hint" id="tms" style="margin:0 0 10px">Check ho raha hai...</p><button type="button" class="btn ghost" style="margin-top:0" id="tmc">Termux setup line copy karo</button><button type="button" class="btn ghost" id="tmp">Chaman ki permissions kholo</button><p class="hint">Copy ki hui line Termux me paste karke chalao (ek baar). Phir Chaman ki permissions me Additional permissions > Run commands in Termux environment allow karo. Termux F-Droid ya GitHub wala hona chahiye.</p></div>';
  h+='<div class="sec"><h2>Workspace (/sdcard/Chaman)</h2><p class="hint" id="wss" style="margin:0 0 10px">Check ho raha hai...</p><button type="button" class="btn ghost" style="margin-top:0" id="wsb">Workspace banao / check karo</button><label>Auto memory</label><select id="ws_auto"><option value="on">On: kaam ke baad khud note save</option><option value="off">Off</option></select><p class="hint">AI ka apna folder: work/ (uski files), memory/ (har project ki .md memory), backup/ (overwrite se pehle ki copy). Pehle Termux setup karna hai.</p></div>';
  h+='<button class="btn" id="save">Save</button>';
  b.innerHTML=h;$('#th').value=S.theme;$('#v_p').value=S.vision.provider;$('#imp').onclick=()=>{kiMode='sheet';$('#ki').click()};
  $('#rs').onclick=()=>{$('#sys').value=DEF_SYS};
  $('#a11b').onclick=()=>NS('openA11ySettings').catch(()=>{});
  $('#tmc').onclick=()=>copyTxt("grep -q '^allow-external-apps=true' ~/.termux/termux.properties 2>/dev/null || { mkdir -p ~/.termux; echo 'allow-external-apps=true' >> ~/.termux/termux.properties; }; termux-reload-settings; termux-setup-storage").then(()=>{$('#tms').textContent='Line copy ho gayi. Termux me paste karke chalao.'});
  $('#tmp').onclick=()=>NT('openAppInfo').catch(()=>{});
  NT('status').then(r=>{$('#tms').textContent='Termux: '+(r.installed?'installed':'nahi mila')+'. Permission: '+(r.permission?'on':'off')+'.'}).catch(()=>{$('#tms').textContent='Ye sirf Android app me chalta hai.'});
  $('#ovb').onclick=()=>NS('requestOverlay').catch(()=>{});
  $('#ws_auto').value=(S.ws&&S.ws.auto===false)?'off':'on';
  $('#wsb').onclick=()=>{$('#wss').textContent='Ban raha hai...';WS_BACKOFF=0;WS_MEM.t=0;wsInfo(true).then(m=>{$('#wss').textContent=m}).catch(e=>{$('#wss').textContent=termuxMsg(e&&e.code)||errMsg(e)})};
  wsInfo(false).then(m=>{$('#wss').textContent=m}).catch(e=>{$('#wss').textContent=termuxMsg(e&&e.code)||'Ye sirf Android app me chalta hai.'});
  $('#ptb').onclick=()=>NS('pill',{text:'Pill test - dikh raha hai?',ttl:5000,state:'wait'}).then(r=>{$('#a11s').textContent=r.ok?'Pill bheja ('+r.type+'). Upar status bar ke neeche dikhna chahiye.':'Pill fail: '+r.err}).catch(e=>{$('#a11s').textContent='Pill fail: '+errMsg(e)});
  NS('status').then(r=>{$('#a11s').textContent='Accessibility: '+(r.a11y?'on':'off')+'. Overlay pill: '+(r.overlay?'on':'off (tab accessibility overlay use hoga)')+'.'}).catch(()=>{$('#a11s').textContent='Ye sirf Android app me chalta hai.'});
  $('#save').onclick=()=>{
    S.ch={url:$('#c_url').value.trim(),key:$('#c_key').value.trim(),hf:$('#c_hf').value.trim()};
    P.filter(p=>!p.g).forEach(p=>{S.keys[p.id]=$('#k_'+p.id).value.trim();const m=$('#m_'+p.id).value.trim();S.models[p.id]=m||p.model});
    S.system=$('#sys').value.trim()||DEF_SYS;S.theme=$('#th').value;S.ws={auto:$('#ws_auto').value!=='off'};S.ptr={};S.vision={provider:$('#v_p').value,model:$('#v_m').value.trim()||'openrouter/free'};
    sv('nap_s',S);theme();$('#sheet').classList.remove('open');
  };
}
$('#setb').onclick=()=>{sheet();$('#sheet').classList.add('open')};
$('#closeb').onclick=()=>$('#sheet').classList.remove('open');
let PEND=[];
