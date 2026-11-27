const T=(p,ms)=>Promise.race([p,new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),ms))]);
const TMO=p=>p.id==='nvidia'||p.think?130000:45000;
const keysOf=id=>(S.keys[id]||'').split(/[\s,]+/).filter(Boolean);

async function callOpenAI(p,msgs,mdl,tools,tchoice){
  const ks=keysOf(p.id);if(!ks.length)return null;
  const sig=TURN&&TURN.ac?TURN.ac.signal:undefined;
  const n=ks.length,start=(S.ptr[p.id]||0)%n;let last='';
  // 1.38000.0: right after ui_render a model may answer with nothing (the widget is the answer): that is not an empty-reply failure
  const lt=msgs[msgs.length-1],uiWait=!!(lt&&lt.role==='tool'&&String(lt.content||'').indexOf('Widget "')===0);
  for(let i=0;i<n;i++){
    const idx=(start+i)%n,k=ks[idx];
    if(i>0)lnSet(p.name.replace(' (optional)','')+': dusri key try kar raha hu','wait');
    if((cool[k]||0)>Date.now()){last='keys cooldown me';continue}
    try{
      const r=await T(fetch(p.url,{method:'POST',signal:sig,headers:{'Content-Type':'application/json','Authorization':'Bearer '+k},body:JSON.stringify(Object.assign({model:mdl||S.models[p.id]||p.model,messages:msgs,max_tokens:p.think?8192:1024},p.think?{thinking:{type:'enabled'}}:{},tools?{tools:tools,tool_choice:tchoice||'auto'}:{}))}),TMO(p));
      if(!r.ok){let bd='';try{bd=(await r.text()).replace(/\s+/g,' ').slice(0,140)}catch(e){}
        if(tools&&[400,404,422].includes(r.status)&&/tool|function/i.test(bd))throw Object.assign(new Error('HTTP '+r.status+' '+bd),{noTools:true});
        cool[k]=Date.now()+(r.status===429?60000:(r.status===401||r.status===403)?600000:15000);last='HTTP '+r.status+(bd?' '+bd:'');continue}
      const j=await r.json();const mm=j.choices&&j.choices[0]&&j.choices[0].message;const t=mm&&mm.content;
      if(tools?!(t||(mm&&mm.tool_calls&&mm.tool_calls.length)||uiWait):!t){last='empty reply';continue}
      if(p.think&&mm&&mm.reasoning_content&&typeof lnThink==='function')lnThink(mm.reasoning_content);
      S.ptr[p.id]=idx;sv('nap_s',S);return tools?mm:t;
    }catch(e){if(e.noTools)throw e;if(sig&&sig.aborted)throw e;cool[k]=Date.now()+15000;last=e.message}
  }
  throw new Error(last);
}
async function callChaman(msgs){
  const c=S.ch;if(!c.url||!c.key)return null;
  const sig=TURN&&TURN.ac?TURN.ac.signal:undefined;
  const base=c.url.replace(/\/+$/,'')+'/gradio_api/call/chat';
  const h={'Content-Type':'application/json'};if(c.hf)h.Authorization='Bearer '+c.hf;
  const r1=await T(fetch(base,{method:'POST',signal:sig,headers:h,body:JSON.stringify({data:[JSON.stringify(msgs),c.key,400]})}),30000);
  if(!r1.ok)throw new Error('HTTP '+r1.status);
  const id=(await r1.json()).event_id;
  const r2=await T(fetch(base+'/'+id,{signal:sig,headers:h}),120000);
  const m=(await r2.text()).match(/event: complete\s*\ndata: (.*)/);
  if(!m)throw new Error('quota khatam ya Space so raha hai');
  const o=JSON.parse(JSON.parse(m[1])[0]);
  if(o.error)throw new Error(o.error);return o.reply;
}
function userText(m,vision,last){
  let t=m.content||'';
  (m.files||[]).forEach(a=>{
    const sv=a.path?'\n[Saved copy: '+a.path+' - file_read / edit_file work on this copy, the original on his phone is not changed]':(a.saveErr?'\n[Copy could not be saved in the workspace: '+a.saveErr+']':'');
    if(a.kind==='text'&&a.body!=null)t+='\n\n[File: '+a.name+' ('+kb(a.size)+')'+(a.cut?', sirf pehla hissa; baaki file_read se padho':'')+']'+sv+'\n'+a.body;
    else if(a.kind==='text')t+='\n\n[File '+a.name+' pehle attach hui thi, ab chat me uska content nahi]'+(a.path?sv:'')+(a.path?'':'\n[Content available nahi]');
    else if(a.kind==='img'){if(!(vision&&last&&m.imgs&&m.imgs.length))t+='\n\n[Image attached: '+a.name+' - tumhe ye dikhti nahi]'+sv}
    else t+='\n\n[File attached: '+a.name+', '+kb(a.size)+'. Content chat me nahi hai'+(a.path?'; use the saved copy: Termux (pdftotext, unzip, python) or file tools if it is text':', sirf naam aur size pata hai')+']'+sv;
  });
  if(m.voice&&last&&typeof VC_HINT!=='undefined')t+=VC_HINT;
  return t.trim()||'(attachment)';
}
const STEPS_KEEP=15;
function stepsNote(m){
  const a=(m.steps||[]).slice(-STEPS_KEEP).map(x=>'- '+String(x).replace(/\s+/g,' ').trim().slice(0,110));
  return a.length?'\n\n[app steps of that turn (the app wrote these, last '+a.length+' of '+m.steps.length+')]\n'+a.join('\n'):'';
}
function apiMsgs(vision){
  const hist=H.filter(m=>!m.err&&!m.info).slice(-20);let li=-1;
  hist.forEach((m,i)=>{if(m.role==='user')li=i});
  // 1.37002.0: the AI also sees the app's own step list of its last 2 tool turns, so "kya kya hua" is answered from facts, not a guess
  const withSteps=new Set();
  for(let i=hist.length-1;i>=0&&withSteps.size<2;i--)if(hist[i].role!=='user'&&hist[i].steps&&hist[i].steps.length)withSteps.add(i);
  return [{role:'system',content:S.system}].concat(hist.map((m,i)=>{
    if(m.role!=='user')return{role:m.role,content:aiText(m)+(withSteps.has(i)?stepsNote(m):'')};
    const t=userText(m,vision,i===li);
    if(vision&&i===li&&m.imgs&&m.imgs.length)return{role:'user',content:[{type:'text',text:t}].concat(m.imgs.map(u=>({type:'image_url',image_url:{url:u}})))};
    return{role:'user',content:t};
  }));
}
const provName=id=>id==='auto'?'Auto':id==='chaman'?'Chaman (sirf chat)':(P.find(p=>p.id===id)||{name:id}).name.replace(' (optional)','');
function provOrder(){
  const ORD=['deepseek','groq','nvidia','cerebras','openrouter','mistral'],rk=p=>{const i=ORD.indexOf(p.id);return i<0?99:i};
  const base=P.filter(p=>!p.g).sort((a,b)=>rk(a)-rk(b)),sel=P.find(p=>p.id===S.prov);
  return sel?[sel].concat(base.filter(p=>p!==sel)):base;
}
