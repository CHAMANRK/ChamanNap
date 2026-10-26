async function runWithTools(p){
  const r=await runLoop(p);
  if(r&&r.steps&&r.steps.length)NS('pill',{text:'Done',ttl:1500}).catch(()=>{});
  return r;
}
async function runLoop(p){
  const msgs=apiMsgs(false),steps=[],by=p.name.replace(' (optional)','');
  let tools=TOOLS;
  SCR_STOP=false;NS('reset').catch(()=>{});
  for(let n=0;n<20;n++){
    let out;
    try{out=await callOpenAI(p,msgs,undefined,tools)}
    catch(e){if(e.noTools&&tools){tools=null;n--;continue}throw e}
    if(out===null)return null;
    if(typeof out==='string')return{content:out.trim(),by,steps};
    const tc=out.tool_calls||[];
    if(!tc.length)return{content:(out.content||'').trim()||'(khaali jawab)',by,steps};
    msgs.push({role:'assistant',content:out.content||'',tool_calls:tc});
    for(const c of tc){
      let args={};try{args=JSON.parse(c.function.arguments||'{}')}catch(e){}
      msgs.push({role:'tool',tool_call_id:c.id,content:await execTool(c.function.name,args,steps)});
    }
    if(SCR_STOP)return{content:'Stop dabaya gaya, kaam rok diya.',by,steps};
  }
  return{content:'Tool steps ki limit (20) ho gayi, kaam adhura ho sakta hai.',by,steps};
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
  const pc=t.match(/^\/(?:provider|prov|p)\b\s*(\S*)\s*$/i);
  if(pc&&!PEND.length){i.value='';i.style.height='auto';setProv(pc[1]);return}
  i.value='';i.style.height='auto';busy=true;$('#send').disabled=true;
  H.push({role:'user',content:t,files:PEND.map(a=>({name:a.name,size:a.size,kind:a.kind,body:a.body,cut:a.cut})),imgs:PEND.filter(a=>a.kind==='img').map(a=>a.img)});
  PEND=[];rendP();render();
  $('#chat').insertAdjacentHTML('beforeend','<div class="msg ai dots" id="ty"><span></span><span></span><span></span></div>');$('#chat').scrollTop=1e9;
  try{const r=await ask();H.push({role:'assistant',content:r.content,by:r.by,steps:r.steps})}
  catch(err){H.push({role:'assistant',content:err.message,err:1})}
  H=H.slice(-100);persist();busy=false;$('#send').disabled=false;render();
});
$('#in').addEventListener('input',e=>{e.target.style.height='auto';e.target.style.height=e.target.scrollHeight+'px'});
$('#newb').onclick=()=>{if(!H.length)return;H=[];sv('nap_h',H);render()};

