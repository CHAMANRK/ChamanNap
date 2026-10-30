// Image generation (NVIDIA genai). URL = IMG_BASE + '/' + model id. Model id, size and steps are editable in Settings.
// Uses the same NVIDIA key as chat. The image is saved to /sdcard/Chaman/work/images/ and shown as a file card.
const IMG_BASE='https://ai.api.nvidia.com/v1/genai';
const IMG_DEF={model:'black-forest-labs/flux-3-image-klein',w:1024,h:1024,steps:50};
const IMG_DIR=WS_ROOT+'/work/images',IMG_TMO=130000;
function imgCfg(){
  const c=S.img||{},n=(v,d,lo,hi)=>{v=Math.round(+v);return isFinite(v)&&v>=lo&&v<=hi?v:d};
  return{model:String(c.model||'').trim().replace(/^\/+|\/+$/g,'')||IMG_DEF.model,w:n(c.w,IMG_DEF.w,64,2048),h:n(c.h,IMG_DEF.h,64,2048),steps:n(c.steps,IMG_DEF.steps,1,150)};
}
function imgPickJson(j){
  const s=x=>typeof x==='string'&&x.length>100?x:'';
  if(!j||typeof j!=='object')return'';
  const a=Array.isArray(j.artifacts)?j.artifacts[0]:null;
  if(a){
    if(a.finishReason&&!/SUCCESS/i.test(a.finishReason))throw new Error('NVIDIA ne image nahi di ('+a.finishReason+')');
    const v=s(a.base64)||s(a.b64_json)||s(a.image);if(v)return v;
  }
  const d=Array.isArray(j.data)?j.data[0]:null,im=Array.isArray(j.images)?j.images[0]:null;
  return s(j.image)||s(j.b64_json)||s(j.base64)||(d&&(s(d.b64_json)||s(d.base64)||s(d.image)))||s(im)||(im&&(s(im.base64)||s(im.b64_json)||s(im.image)))||'';
}
const imgExt=b=>b.startsWith('/9j/')?'jpg':b.startsWith('UklGR')?'webp':'png';
function imgName(ext){const d=new Date(),z=n=>String(n).padStart(2,'0');return'img-'+d.getFullYear()+z(d.getMonth()+1)+z(d.getDate())+'-'+z(d.getHours())+z(d.getMinutes())+z(d.getSeconds())+'.'+ext}
async function imgUnique(ext){
  const nm=imgName(ext);let p=IMG_DIR+'/'+nm;
  for(let k=1;k<50&&(await NF('stat',{path:p})).exists;k++)p=IMG_DIR+'/'+nm.replace(/\.(\w+)$/,'-'+k+'.$1');
  return p;
}
const u8b64=u8=>{let s='';for(let i=0;i<u8.length;i+=8192)s+=String.fromCharCode.apply(null,u8.subarray(i,i+8192));return btoa(s)};
async function imgFetch(url,k,body){
  const h={'Content-Type':'application/json','Accept':'application/json','Authorization':'Bearer '+k};
  let r=await T(fetch(url,{method:'POST',headers:h,body:JSON.stringify(body)}),IMG_TMO);
  const t0=Date.now();
  while(r.status===202){
    const id=r.headers.get('NVCF-REQID');if(!id)throw new Error('HTTP 202 par request id nahi mila');
    if(Date.now()-t0>IMG_TMO)throw new Error('timeout');
    await sleep(2000);
    r=await T(fetch('https://api.nvcf.nvidia.com/v2/nvcf/pexec/status/'+id,{headers:{'Authorization':'Bearer '+k,'Accept':'application/json'}}),30000);
  }
  return r;
}
// Returns {path,size,model}. Throws Error with a short readable message.
async function genImage(prompt,o){
  o=o||{};const c=imgCfg();
  const ks=keysOf('nvidia');if(!ks.length)throw new Error('NVIDIA ki key Settings me daalo.');
  if(!/^[\w.\-]+(\/[\w.\-]+)+$/.test(c.model))throw new Error('Image model id galat hai: '+c.model);
  const url=IMG_BASE+'/'+c.model;
  const w=o.w||c.w,h=o.h||c.h,steps=o.steps||c.steps;
  const body={prompt:String(prompt).slice(0,2000),width:w,height:h,seed:0,steps:steps};
  let last='';
  for(const k of ks){
    if((cool[k]||0)>Date.now()){last='key cooldown me';continue}
    try{
      const r=await imgFetch(url,k,body);
      if(!r.ok){let bd='';try{bd=(await r.text()).replace(/\s+/g,' ').slice(0,160)}catch(e){}
        cool[k]=Date.now()+(r.status===429?60000:(r.status===401||r.status===403)?600000:15000);last='HTTP '+r.status+(bd?' '+bd:'');continue}
      let b64='';
      if(/^image\//i.test(r.headers.get('content-type')||''))b64=u8b64(new Uint8Array(await r.arrayBuffer()));
      else b64=imgPickJson(await r.json()).replace(/^data:[^,]*,/,'');
      if(!b64){last='response me image nahi mili';continue}
      const p=await imgUnique(imgExt(b64));
      const raw=atob(b64),u=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)u[i]=raw.charCodeAt(i);
      for(let i=0;;i+=UP_CHUNK){
        await NF('writeB64',{path:p,b64:upB64(u.subarray(i,i+UP_CHUNK)),append:i>0});
        if(i+UP_CHUNK>=u.length)break;
      }
      return{path:p,size:u.length,model:c.model};
    }catch(e){
      if(e&&e.code==='NO_ACCESS'){if(!FILES_HINTED){FILES_HINTED=true;NF('requestAccess').catch(()=>{})}throw new Error('Image save karne ke liye All files access chahiye.')}
      cool[k]=Date.now()+15000;last=e.message||String(e);
    }
  }
  throw new Error(last||'image nahi bani');
}
TOOLS.push(fn('generate_image','Make an image from a text prompt with the NVIDIA image model (Najeef set the model in Settings). Write the prompt in English, detailed: subject, style, light, mood. It takes up to about 2 minutes. The image is saved in /sdcard/Chaman/work/images/ and shown to Najeef as a file card automatically, so do not call file_present for it. Call it once per image. Optional width and height (multiples of 64, 256-2048).',{prompt:{type:'string'},width:{type:'integer',minimum:256,maximum:2048},height:{type:'integer',minimum:256,maximum:2048}},['prompt']));
async function imageTool(a,note,fl){
  const pr=String(a.prompt||'').trim();
  if(!pr){fl.bad=true;return note('Prompt nahi diya.')}
  const sz=v=>{v=Math.round((+v||0)/64)*64;return v>=256&&v<=2048?v:0};
  try{
    const r=await genImage(pr,{w:sz(a.width),h:sz(a.height)});
    FILE_TURN.p[r.path]=1;pushCard(r.path,r.size,'Image');
    return note('Image bani: '+r.path.split('/').pop())+' Card Najeef ko dikha diya, file '+r.path+'. Dobara mat banao jab tak woh na bole.';
  }catch(e){fl.bad=true;return note('Image fail: '+errMsg(e))}
}
async function imageCmd(arg){
  const say=c=>H.push({role:'assistant',by:'App',info:1,content:c});
  const pr=String(arg||'').trim();
  if(!pr){const c=imgCfg();say('Aise likho: /image ek shaant jheel pe subah ka suraj\nModel: '+c.model+' ('+c.w+'x'+c.h+', '+c.steps+' steps). Settings me badal sakte ho.');return}
  const wait={role:'assistant',by:'App',info:1,content:'Image ban rahi hai, 2 minute tak lag sakte hain...'};
  H.push(wait);liveRender();
  lnSet('NVIDIA se image ban rahi hai','wait');
  try{
    const r=await genImage(pr);
    const i=H.indexOf(wait);if(i>=0)H.splice(i,1);
    pushCard(r.path,r.size,'Image: '+cut(pr,40));
  }catch(e){const i=H.indexOf(wait);if(i>=0)H.splice(i,1);say('Image fail: '+errMsg(e))}
}
SLASH.push({name:'image',hint:'NVIDIA se image banao',run:a=>imageCmd(a)},{name:'img',hint:'/image ka short',run:a=>imageCmd(a)});
