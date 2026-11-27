// 1.52000.0 Voice v0.1: mic (STT) -> normal message -> AI reply -> TTS.
//  - mic button in the composer: tap = listen (hi-IN / en-IN), the spoken text is sent like a typed message (same submit path as the Send button).
//  - after the reply: ElevenLabs (keys rotate, a failing key cools down) -> Android TTS if ElevenLabs fails. Code blocks, links, tables are not spoken.
//  - v0.1 has no streaming: the whole reply is spoken after it arrives (v0.2: streaming + sentence by sentence).
// Native side: native/VoicePlugin.java (STT, download + play of the mp3, Android TTS). Keys are never hardcoded or logged; they come from Settings > Voice.
const NV=(m,o)=>NPx('Voice',m,o);
var VC={st:'idle',tok:0,send:false,speakNext:false,note:false,ptr:0,vid:''};
// reply-short hint for a message that came from the mic (added only to the AI request, never shown in chat)
const VC_HINT='\n\n[voice mode: tumhara jawab bola jayega. 2-4 chhote vakya me, bolne layak likho. Code, link, table ya lambi list tab hi likho jab sach me chahiye, wo bola nahi jayega.]';
// model default is the usual multilingual one; it is NOT verified from here. Settings > Voice > "Models ki list" shows the real list of the account.
const VC_DEF={on:true,engine:'eleven',model:'eleven_multilingual_v2',voice:'',speed:1,lang:'hi-IN',say:'mic',keys:''};
const vcCfg=()=>Object.assign({},VC_DEF,S.vc||{});
const vcKeys=c=>String((c||vcCfg()).keys||'').split(/[\s,]+/).filter(Boolean);
const vcWhy=e=>String(errMsg(e)).replace(/\s+/g,' ').slice(0,90);
const MIC_SVG='<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>';
const MIC_STOP_SVG='<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg>';

// ---------- text that is worth speaking ----------
function vcClean(t){
  t=String(t==null?'':t);
  t=t.replace(/```[\s\S]*?(```|$)/g,' ');                                   // code blocks (also one that never closes)
  // tables: rows with a leading pipe, the header row above a |---| line, and --- lines
  const sep=l=>/^\s*[-:| ]{3,}\s*$/.test(l),ln=t.split('\n');
  t=ln.filter((l,i)=>!/^\s*\|/.test(l)&&!sep(l)&&!(l.indexOf('|')>=0&&i+1<ln.length&&sep(ln[i+1])&&ln[i+1].indexOf('|')>=0)).join('\n');
  t=t.replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/https?:\/\/\S+|www\.\S+/gi,' '); // images, links
  t=t.replace(/<[^>]+>/g,' ').replace(/`([^`]*)`/g,'$1');
  t=t.replace(/^\s{0,3}#{1,6}\s*/gm,'').replace(/^\s*>\s?/gm,'').replace(/^\s*([-*+]|\d+[.)])\s+/gm,'').replace(/[*_~#>|]+/g,' ');
  t=t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu,'');
  return t.replace(/[ \t]+/g,' ').replace(/\s*\n\s*/g,'\n').trim();
}
// pieces of <= max chars at sentence ends (the next piece is downloaded while this one plays). Total is capped.
function vcChunks(t,max,cap){
  max=max||450;cap=cap||3000;
  const out=[];let cur='',tot=0;
  const push=()=>{const x=cur.trim();if(x)out.push(x);cur=''};
  const sents=String(t||'').match(/[^.!?।\n]+[.!?।]*\s*/g)||[];
  for(let s of sents){
    if(tot>=cap)break;
    while(s.length>max){   // one very long sentence: cut at a space
      if(tot>=cap){s='';break}
      let k=s.lastIndexOf(' ',max);if(k<max/2)k=max;
      if(cur.length+k>max)push();
      cur+=s.slice(0,k);push();tot+=k;s=s.slice(k);
    }
    if(cur.length+s.length>max)push();
    cur+=s;tot+=s.length;
  }
  push();
  return out;
}
const vcLang=t=>/[ऀ-ॿ]/.test(t)?'hi-IN':'en-IN';

// ---------- state + mic button ----------
function vcSt(st){
  VC.st=st;
  const b=$('#micb');if(!b)return;
  if(b.classList&&b.classList.toggle){b.classList.toggle('rec',st==='listen');b.classList.toggle('spk',st==='speak')}
  b.setAttribute&&b.setAttribute('aria-label',st==='speak'?'Bolna band karo':st==='listen'?'Sunna band karo':'Mic');
  b.innerHTML=st==='speak'?MIC_STOP_SVG:MIC_SVG;
  const i=$('#in');if(i&&'placeholder' in i)i.placeholder=st==='listen'?'Sun raha hu... bolo':'Message likho';
}
function vcInfo(m){H.push({role:'assistant',content:m,by:'App',info:1});persist();render()}
function vcNote(m){if(VC.note)return;VC.note=true;vcInfo(m)}

// ---------- speak ----------
async function vcAutoVoice(k){
  if(VC.vid)return VC.vid;
  const r=await NV('elGet',{key:k,what:'voices'}),v=r&&r.items&&r.items[0];
  if(!v||!v.id)throw new Error('Account me koi voice nahi mili. Settings > Voice me voice chuno.');
  VC.vid=v.id;return VC.vid;
}
// one piece -> {path} (mp3 in the app cache). Keys rotate round-robin; 429 / 401 / other failures put that key on cooldown (shared cool[] with providers).
async function vcElFetch(text,c){
  const ks=vcKeys(c);if(!ks.length)throw new Error('ElevenLabs key nahi hai');
  const voice=c.voice||await vcAutoVoice(ks[0]);
  const n=ks.length,st=VC.ptr%n;let last='';
  for(let i=0;i<n;i++){
    const idx=(st+i)%n,k=ks[idx];
    if((cool[k]||0)>Date.now()){last='keys cooldown me';continue}
    try{const r=await NV('ttsFetch',{key:k,voice,model:c.model,speed:Number(c.speed)||1,text});VC.ptr=idx+1;return r}
    catch(e){const s=Number(e&&e.code);cool[k]=Date.now()+(s===429?60000:(s===401||s===403)?600000:15000);last=errMsg(e)}
  }
  throw new Error(last);
}
async function vcSpeak(text){
  const chunks=vcChunks(vcClean(text));if(!chunks.length)return;
  const c=vcCfg(),tok=++VC.tok;VC.note=false;vcSt('speak');
  let el=c.engine!=='android'&&vcKeys(c).length>0;
  const fetchOf=i=>el?vcElFetch(chunks[i],c).catch(e=>({err:e})):Promise.resolve(null);
  try{
    let next=fetchOf(0);
    for(let i=0;i<chunks.length;i++){
      const r=await next;
      if(VC.tok!==tok){if(r&&r.path)NV('discard',{path:r.path}).catch(()=>{});return}
      if(r&&r.err){el=false;vcNote('ElevenLabs fail ('+vcWhy(r.err)+'), Android awaaz chali.')}
      next=i+1<chunks.length?fetchOf(i+1):null;   // prefetch: next piece downloads while this one plays
      let played=false;
      if(r&&r.path){try{await NV('play',{path:r.path});played=true}catch(e){if(VC.tok!==tok)return;el=false;vcNote('Audio play fail ('+vcWhy(e)+'), Android awaaz chali.')}}
      if(!played){
        if(VC.tok!==tok)return;
        await NV('speakAndroid',{text:chunks[i],lang:vcLang(chunks[i]),rate:Number(c.speed)||1});
      }
    }
  }catch(e){if(VC.tok===tok)vcNote('Voice fail: '+vcWhy(e))}
  finally{if(VC.tok===tok)vcSt('idle')}
}
function vcStop(){VC.tok++;NV('stopSpeak').catch(()=>{});vcSt('idle')}

// ---------- listen ----------
function vcSend(t){
  const i=$('#in'),old=i.value,pend=PEND;
  PEND=[];i.value=t;VC.send=true;VC.speakNext=true;
  try{$('#f').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}))}
  finally{i.value=old;PEND=pend;if(VC.send)VC.speakNext=false;VC.send=false}
}
async function vcMic(){
  if(!vcCfg().on)return;
  if(VC.st==='speak'){vcStop();return}
  if(VC.st==='listen'){NV('stopListen').catch(()=>{});return}
  if(busy)return;
  VC.tok++;NV('stopSpeak').catch(()=>{});
  vcSt('listen');
  let r=null;
  try{r=await NV('listen',{lang:vcCfg().lang})}
  catch(e){vcSt('idle');vcInfo(e&&e.code==='PERMISSION'?errMsg(e):'Mic: '+errMsg(e));return}
  vcSt('idle');
  const t=String((r&&r.text)||'').trim();
  if(!t){if(!r||r.reason!=='cancelled')vcInfo('Kuch suna nahi. Mic dabake saaf bolo.');return}
  if(busy)return;
  vcSend(t);
}
// called by the submit handler (chat.js) for every real message: a new message cuts the old speech, and a mic message is marked for the voice hint
function vcOnSend(um){
  if(VC.st==='speak')vcStop();
  if(VC.send){um.voice=1;VC.send=false}
}
// called when a turn ends (chat.js, next to bubTurnEnd)
function vcTurnEnd(){
  const c=vcCfg(),sp=VC.speakNext;VC.speakNext=false;
  if(!c.on||c.say==='off'||!(c.say==='all'||sp))return;
  let m=null;
  for(let k=H.length-1;k>=0;k--){const x=H[k];if(x.role==='user')break;if(x.role==='assistant'&&!x.confirm&&!x.imgp){m=x;break}}
  if(!m||m.err||m.info||m.ui)return;
  vcSpeak(m.content).catch(()=>{});
}

// ---------- Settings > Voice ----------
function vcSettingsHtml(){
  const c=vcCfg(),n=vcKeys(c).length;
  const opt=(v,l)=>'<option value="'+v+'">'+l+'</option>';
  return'<details class="sec"><summary><span class="st">Voice (mic + awaaz)</span><span class="sb">'+(c.on?(n?'ElevenLabs':'Android'):'Off')+'</span></summary><div class="sbd">'
   +'<label>Voice</label><select id="vc_on">'+opt('on','On: mic button aur bolna')+opt('off','Off')+'</select>'
   +'<label>Reply kab bole</label><select id="vc_say">'+opt('mic','Sirf mic se bheje message ka')+opt('all','Har reply')+opt('off','Kabhi nahi')+'</select>'
   +'<label>Awaaz engine</label><select id="vc_eng">'+opt('eleven','ElevenLabs (fail ho to Android)')+opt('android','Sirf Android')+'</select>'
   +'<label>ElevenLabs keys (comma ya nayi line se alag; Keys import file se bhi aa sakti hain)</label><textarea id="vc_keys" style="min-height:64px" autocomplete="off" autocapitalize="off" spellcheck="false">'+esc(c.keys)+'</textarea>'
   +'<label>Model id</label><input id="vc_model" value="'+esc(c.model)+'" autocapitalize="off" spellcheck="false">'
   +'<label>Voice id (khaali = account ki pehli voice)</label><input id="vc_voice" value="'+esc(c.voice)+'" autocapitalize="off" spellcheck="false">'
   +'<button type="button" class="btn ghost" id="vc_lm">Models ki list (asli call)</button><button type="button" class="btn ghost" id="vc_lv">Voices ki list (asli call)</button><div id="vc_list"></div>'
   +'<label>Speed (0.7 se 1.2)</label><input id="vc_speed" type="number" min="0.7" max="1.2" step="0.05" value="'+esc(String(c.speed))+'">'
   +'<label>Bolne ki bhasha (mic)</label><select id="vc_lang">'+opt('hi-IN','Hindi + English (hi-IN)')+opt('en-IN','English (en-IN)')+'</select>'
   +'<button type="button" class="btn" id="vc_test">Awaaz test karo</button><p class="hint" id="vc_msg">Test form ki abhi ki values se chalta hai (Save zaroori nahi). Model/voice ka naam yaad se nahi, list dabake asli account se chuno.</p>'
   +'</div></details>';
}
function vcForm(){
  const g=id=>{const e=$('#'+id);return e?e.value:''};
  const sp=parseFloat(g('vc_speed'));
  return{on:g('vc_on')!=='off',say:g('vc_say')||'mic',engine:g('vc_eng')==='android'?'android':'eleven',keys:g('vc_keys').split(/[\s,]+/).filter(Boolean).join(', '),
    model:g('vc_model').trim()||VC_DEF.model,voice:g('vc_voice').trim(),speed:isFinite(sp)?Math.max(0.7,Math.min(1.2,sp)):1,lang:g('vc_lang')==='en-IN'?'en-IN':'hi-IN'};
}
function vcRead(){if(!$('#vc_on'))return;S.vc=vcForm();VC.vid='';vcMicShow()}
function vcMicShow(){const b=$('#micb');if(b)b.hidden=!vcCfg().on}
function vcBind(){
  if(!$('#vc_on'))return;
  const c=vcCfg();
  $('#vc_on').value=c.on?'on':'off';$('#vc_say').value=c.say;$('#vc_eng').value=c.engine==='android'?'android':'eleven';$('#vc_lang').value=c.lang;
  const msg=t=>{$('#vc_msg').textContent=t};
  const pick=(what)=>{
    const f=vcForm(),k=vcKeys(f)[0];
    if(!k){msg('Pehle ElevenLabs key daalo.');return}
    msg('List aa rahi hai...');
    NV('elGet',{key:k,what}).then(r=>{
      const it=(r&&r.items)||[];
      if(!it.length){$('#vc_list').innerHTML='';msg('Kuch nahi mila.');return}
      $('#vc_list').innerHTML=it.map(x=>'<button type="button" class="btn ghost vcp" data-w="'+what+'" data-id="'+esc(x.id)+'">'+esc(x.name||x.id)+(x.info?' ('+esc(x.info)+')':'')+'</button>').join('');
      $('#vc_list').onclick=e=>{const b=e.target.closest&&e.target.closest('.vcp');if(!b)return;$(b.dataset.w==='models'?'#vc_model':'#vc_voice').value=b.dataset.id;msg('Chuna: '+b.dataset.id+'. Ab Save dabao.')};
      msg(it.length+' mile. Tap karke chuno.');
    }).catch(e=>msg('List fail: '+vcWhy(e)));
  };
  $('#vc_lm').onclick=()=>pick('models');
  $('#vc_lv').onclick=()=>pick('voices');
  $('#vc_test').onclick=async()=>{
    const f=Object.assign(vcCfg(),vcForm());
    msg('Test chal raha hai...');
    const prev=S.vc;S.vc=f;VC.note=false;
    try{
      await vcSpeak('Namaste, main Chaman hu. Ye meri awaaz ka test hai.');
      msg(VC.note?'Test ho gaya, par ElevenLabs fail hua. Chat me wajah likhi hai (Settings band karke dekho).':(f.engine==='android'||!vcKeys(f).length?'Android awaaz chali.':'ElevenLabs awaaz chali.'));
    }catch(e){msg('Test fail: '+vcWhy(e))}
    S.vc=prev;
  };
}
{const b=$('#micb');if(b){b.onclick=()=>vcMic();vcSt('idle');vcMicShow()}}
