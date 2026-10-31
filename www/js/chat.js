async function runWithTools(p){
  const r=await runLoop(p);
  if(r){
    lnEnd();
    if(r.steps&&r.steps.length&&PILL_ERR){r.steps.push('Status line nahi dikhi: '+PILL_ERR);PILL_ERR=''}
    if(r.steps&&r.steps.length&&LEFT_APP)NS('finish').catch(()=>{});else NS('finish',{open:false}).catch(()=>{});
  }
  return r;
}
async function runLoop(p){
  const tn=TURN||{stop:false},msgs=apiMsgs(false),steps=[],by=p.name.replace(' (optional)',''),used={run:0,write:false,mem:false};
  tn.steps=steps;
  const stopped=()=>({content:'Stop dabaya gaya.',by,steps});
  const mem=await wsLoadMem();if(mem)msgs[0].content+=mem;
  const rb=rulesBlock();if(rb)msgs[0].content+=rb;
  const guard={n:0};
  let tools=TOOLS;
  FILE_TURN={w:'',p:{}};SCR_STOP=false;LEFT_APP=false;PILL_ERR='';NS('reset').catch(()=>{});
  const fin=async c=>{if(tools){await autoMem(p,msgs,used,c,steps);if(typeof autoPresent==='function')await autoPresent()}return{content:c,by,steps}};
  const finChk=async c=>{
    if(fakeOut(c)){
      if(!guard.n){guard.n=1;lnSet('Jawab dobara pooch raha hu','wait');msgs.push({role:'assistant',content:c},{role:'user',content:FAKE_MSG});logAdd('guard','AI ne khud tool-output jaisa likha, ek baar dobara pucha');return null}
      c=FAKE_WARN+c;
    }
    return await fin(c);
  };
  for(let n=0;n<20;n++){
    if(tn.stop)return stopped();
    let out;
    lnSet(by+' se jawab ka wait','wait');
    try{out=await callOpenAI(p,msgs,undefined,tools)}
    catch(e){if(e.noTools&&tools){tools=null;n--;continue}throw e}
    if(tn.stop)return stopped();
    if(out===null)return null;
    if(typeof out==='string'){const r=await finChk(out.trim());if(r)return r;continue}
    const tc=out.tool_calls||[];
    if(!tc.length){const r=await finChk((out.content||'').trim()||'(khaali jawab)');if(r)return r;continue}
    msgs.push({role:'assistant',content:out.content||'',tool_calls:tc});
    for(const c of tc){
      let args={};try{args=JSON.parse(c.function.arguments||'{}')}catch(e){}
      const nm=c.function.name;
      if(nm==='termux_run')used.run++;else if(nm==='termux_write_file'||nm==='file_write'||nm==='edit_file')used.write=true;else if(nm==='memory_save')used.mem=true;
      if(tn.stop)return stopped();
      tn.tool=nm;
      msgs.push({role:'tool',tool_call_id:c.id,content:await execTool(nm,args,steps)});
      tn.tool='';
    }
    if(tn.stop)return stopped();
    if(SCR_STOP)return{content:'Stop dabaya gaya, kaam rok diya.',by,steps};
  }
  return await fin('Tool steps ki limit (20) ho gayi, kaam adhura ho sakta hai.');
}
async function ask(){
  const tn=TURN||{stop:false},lm=H[H.length-1];
  if(lm&&lm.imgs&&lm.imgs.length){
    const vp=P.find(p=>p.id===S.vision.provider)||P.find(p=>p.id==='nvidia');
    let t;
    lnSet('Photo dekh raha hu: '+vp.name,'wait');
    try{t=await callOpenAI(vp,apiMsgs(true),S.vision.model)}catch(e){if(tn.stop)throw e;throw new Error('Vision ('+vp.name+') fail: '+e.message)}
    if(!t)throw new Error('Vision ke liye '+vp.name+' ki key Settings me daalo.');
    return{content:t.trim(),by:vp.name+' - vision'};
  }
  const errs=[],ord=provOrder();
  for(let i=0;i<ord.length;i++){
    const p=ord[i];
    if(tn.stop)throw new Error('stop');
    try{
      if(p.g){const t=await callChaman(apiMsgs(false));if(t)return{content:t.trim(),by:p.name};continue}
      const r=await runWithTools(p);if(r)return r;
    }catch(e){
      if(tn.stop)throw e;
      errs.push(p.name+': '+e.message);
      const nx=ord[i+1];
      if(nx)lnSet(p.name.replace(' (optional)','')+' fail ('+lnWhy(e)+'), '+nx.name.replace(' (optional)','')+' try kar raha hu','wait');
    }
  }
  throw new Error(errs.length?'Saare providers fail:\n'+errs.join('\n'):'Koi provider set nahi hai. Settings me key daalo.');
}
function setProv(v){
  v=(v||'').toLowerCase();const ids=['auto'].concat(P.map(p=>p.id));
  const say=c=>H.push({role:'assistant',content:c,by:'App',info:1});
  if(!v)say('Abhi provider: '+provName(S.prov)+'\nOptions: '+ids.join(', ')+'\nBadalne ke liye: /provider groq');
  else{
    const id=ids.includes(v)?v:ids.find(x=>x.startsWith(v));
    if(!id)say('"'+v+'" provider nahi mila. Options: '+ids.join(', '));
    else{S.prov=id;sv('nap_s',S);syncProv();say('Provider ab: '+provName(id))}
  }
  persist();render();
}
// ---------- Stop: the Send button turns into Stop while a turn runs ----------
// Each turn has TURN={stop,ac,steps,tool}. Stop aborts the running AI request, tells the phone side to stop (screen tasks, face check) and
// ends the turn in the UI at once. A tool that was already running (e.g. a Termux command) is not killed: it finishes in the background,
// but nothing new starts, and the next message waits up to 4 s for it.
const SEND_SVG=($('#send')||{}).innerHTML||'';
const STOP_SVG='<svg class="ib" style="width:20px;height:20px" viewBox="0 0 24 24"><rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor"/></svg>';
const STOPPED={stopped:1};
function setBusy(on){
  busy=on;const b=$('#send');if(!b)return;
  b.disabled=false;
  if(b.classList&&b.classList.toggle)b.classList.toggle('stop',!!on);
  if(b.setAttribute)b.setAttribute('aria-label',on?'Stop':'Send');
  b.innerHTML=on?STOP_SVG:SEND_SVG;
}
function turnBegin(){TURN={stop:false,ac:typeof AbortController!=='undefined'?new AbortController():null,steps:null,tool:'',wake:null,p:null,settled:false};return TURN}
// Resolves with p's value, or with STOPPED as soon as Stop is pressed (p itself may keep running in the background).
function turnWait(t,p){
  t.p=Promise.resolve(p).then(()=>{t.settled=true},()=>{t.settled=true});
  return Promise.race([p,new Promise(res=>{t.wake=()=>res(STOPPED)})]);
}
function stopNote(t){return{role:'assistant',content:'Stop dabaya gaya.'+(t.tool?'\n('+t.tool+' us waqt chal raha tha, wo background me poora ho sakta hai.)':''),by:'App',info:1,steps:(t.steps||[]).slice()}}
function stopTurn(){
  const t=TURN;if(!busy||!t||t.stop)return;
  t.stop=true;LAST_STOP=t;
  try{if(t.ac)t.ac.abort()}catch(e){}
  NS('stop').catch(()=>{});
  if(typeof FL_BUSY!=='undefined'&&FL_BUSY&&typeof FLN==='function')FLN('cancel').catch(()=>{});
  logAdd('stop','Stop dabaya gaya');
  if(t.wake)t.wake();
}
{const sb=$('#send');if(sb&&sb.addEventListener)sb.addEventListener('click',e=>{if(busy){e.preventDefault();stopTurn()}})}
$('#f').addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;
  const i=$('#in'),t=i.value.trim();if(!t&&!PEND.length)return;
  const sl=(typeof slashTake==='function'&&!PEND.length)?slashTake(t):null;
  if(typeof hideSlash==='function')hideSlash();
  if(sl){i.value='';i.style.height='auto';await slashRun(sl,t);return}
  i.value='';i.style.height='auto';setBusy(true);const tn=turnBegin();
  logAdd('you',t+(PEND.length?' [files: '+PEND.map(a=>a.name).join(', ')+']':''));
  const pl=PEND.slice(),um={role:'user',content:t,files:pl.map(a=>({name:a.name,size:a.size,kind:a.kind,body:a.body,cut:a.cut})),imgs:pl.filter(a=>a.kind==='img').map(a=>a.img)};
  H.push(um);
  PEND=[];rendP();render();
  lnBegin('Message bhej raha hu','wait');
  try{
    const pv=LAST_STOP;
    if(pv&&!pv.settled&&pv.p){lnSet('Pichla kaam ruk raha hai','wait');await Promise.race([pv.p,sleep(4000)])}
    if(pl.length&&typeof saveUploads==='function'){
      lnSet('File save ho rahi hai','wait');
      await saveUploads(pl);
      um.files.forEach((f,k)=>{f.path=pl[k].path;f.saveErr=pl[k].saveErr});
      logAdd('upload',pl.map(a=>a.name+(a.path?' -> '+a.path.replace(WS_ROOT+'/',''):' (copy fail: '+a.saveErr+')')).join(', '));
    }
const r=await turnWait(tn,ask());
    if(r===STOPPED||tn.stop)H.push(stopNote(tn));
    else{H.push({role:'assistant',content:r.content,by:r.by,steps:r.steps});logAdd('chaman','('+(r.by||'?')+') '+r.content)}}
  catch(err){if(tn.stop)H.push(stopNote(tn));else{H.push({role:'assistant',content:err.message,err:1});logAdd('error',err.message)}}
  const lnWas=LN.on;lnEnd();if(lnWas)NS('finish',{open:false}).catch(()=>{});
  H=H.slice(-100);persist();TURN=null;setBusy(false);render();logFlush();
});
$('#in').addEventListener('input',e=>{e.target.style.height='auto';e.target.style.height=e.target.scrollHeight+'px'});
$('#newb').onclick=()=>{if(!H.length)return;H=[];sv('nap_h',H);render()};

