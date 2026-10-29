async function runWithTools(p){
  const r=await runLoop(p);
  if(r&&r.steps&&r.steps.length){
    if(PILL_ERR){r.steps.push('Pill nahi dikha: '+PILL_ERR);PILL_ERR=''}
    if(LEFT_APP)NS('finish').catch(()=>{});else NS('pill',{text:'Done',ttl:1500,state:'ok'}).catch(()=>{});
  }
  return r;
}
async function runLoop(p){
  const msgs=apiMsgs(false),steps=[],by=p.name.replace(' (optional)',''),used={run:0,write:false,mem:false};
  const mem=await wsLoadMem();if(mem)msgs[0].content+=mem;
  const rb=rulesBlock();if(rb)msgs[0].content+=rb;
  const guard={n:0};
  let tools=TOOLS;
  FILE_TURN={w:'',p:{}};SCR_STOP=false;LEFT_APP=false;PILL_ERR='';NS('reset').catch(()=>{});
  const fin=async c=>{if(tools){await autoMem(p,msgs,used,c,steps);if(typeof autoPresent==='function')await autoPresent()}return{content:c,by,steps}};
  const finChk=async c=>{
    if(fakeOut(c)){
      if(!guard.n){guard.n=1;msgs.push({role:'assistant',content:c},{role:'user',content:FAKE_MSG});logAdd('guard','AI ne khud tool-output jaisa likha, ek baar dobara pucha');return null}
      c=FAKE_WARN+c;
    }
    return await fin(c);
  };
  for(let n=0;n<20;n++){
    let out;
    try{out=await callOpenAI(p,msgs,undefined,tools)}
    catch(e){if(e.noTools&&tools){tools=null;n--;continue}throw e}
    if(out===null)return null;
    if(typeof out==='string'){const r=await finChk(out.trim());if(r)return r;continue}
    const tc=out.tool_calls||[];
    if(!tc.length){const r=await finChk((out.content||'').trim()||'(khaali jawab)');if(r)return r;continue}
    msgs.push({role:'assistant',content:out.content||'',tool_calls:tc});
    for(const c of tc){
      let args={};try{args=JSON.parse(c.function.arguments||'{}')}catch(e){}
      const nm=c.function.name;
      if(nm==='termux_run')used.run++;else if(nm==='termux_write_file'||nm==='file_write'||nm==='edit_file')used.write=true;else if(nm==='memory_save')used.mem=true;
      msgs.push({role:'tool',tool_call_id:c.id,content:await execTool(nm,args,steps)});
    }
    if(SCR_STOP)return{content:'Stop dabaya gaya, kaam rok diya.',by,steps};
  }
  return await fin('Tool steps ki limit (20) ho gayi, kaam adhura ho sakta hai.');
}
async function ask(){
  const lm=H[H.length-1];
  if(lm&&lm.imgs&&lm.imgs.length){
    const vp=P.find(p=>p.id===S.vision.provider)||P.find(p=>p.id==='nvidia');
    let t;
    try{t=await callOpenAI(vp,apiMsgs(true),S.vision.model)}catch(e){throw new Error('Vision ('+vp.name+') fail: '+e.message)}
    if(!t)throw new Error('Vision ke liye '+vp.name+' ki key Settings me daalo.');
    return{content:t.trim(),by:vp.name+' - vision'};
  }
  const errs=[];
  for(const p of provOrder()){
    try{
      if(p.g){const t=await callChaman(apiMsgs(false));if(t)return{content:t.trim(),by:p.name};continue}
      const r=await runWithTools(p);if(r)return r;
    }catch(e){errs.push(p.name+': '+e.message)}
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
$('#f').addEventListener('submit',async e=>{
  e.preventDefault();if(busy)return;
  const i=$('#in'),t=i.value.trim();if(!t&&!PEND.length)return;
  const sl=(typeof slashTake==='function'&&!PEND.length)?slashTake(t):null;
  if(typeof hideSlash==='function')hideSlash();
  if(sl){i.value='';i.style.height='auto';await slashRun(sl,t);return}
  i.value='';i.style.height='auto';busy=true;$('#send').disabled=true;
  logAdd('you',t+(PEND.length?' [files: '+PEND.map(a=>a.name).join(', ')+']':''));
  const pl=PEND.slice(),um={role:'user',content:t,files:pl.map(a=>({name:a.name,size:a.size,kind:a.kind,body:a.body,cut:a.cut})),imgs:pl.filter(a=>a.kind==='img').map(a=>a.img)};
  H.push(um);
  PEND=[];rendP();render();
  $('#chat').insertAdjacentHTML('beforeend','<div class="msg ai dots" id="ty"><span></span><span></span><span></span></div>');$('#chat').scrollTop=1e9;
  try{
    if(pl.length&&typeof saveUploads==='function'){
      await saveUploads(pl);
      um.files.forEach((f,k)=>{f.path=pl[k].path;f.saveErr=pl[k].saveErr});
      logAdd('upload',pl.map(a=>a.name+(a.path?' -> '+a.path.replace(WS_ROOT+'/',''):' (copy fail: '+a.saveErr+')')).join(', '));
    }
const r=await ask();H.push({role:'assistant',content:r.content,by:r.by,steps:r.steps});logAdd('chaman','('+(r.by||'?')+') '+r.content)}
  catch(err){H.push({role:'assistant',content:err.message,err:1});logAdd('error',err.message)}
  H=H.slice(-100);persist();busy=false;$('#send').disabled=false;render();logFlush();
});
$('#in').addEventListener('input',e=>{e.target.style.height='auto';e.target.style.height=e.target.scrollHeight+'px'});
$('#newb').onclick=()=>{if(!H.length)return;H=[];sv('nap_h',H);render()};

