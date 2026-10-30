// Image generation: NVIDIA genai url + editable model id, response shapes, key rotation, 202 polling, tool, /image, file card.
// Step12b: attachments are copied to work/uploads (chunked base64), names do not clash, the AI is told the path, viewer saves to Download.
const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{add(){els[sel+'#open']=1},remove(){delete els[sel+'#open']},toggle(){}},addEventListener(t,f){const k=sel+':'+t,pv=handlers[k];handlers[k]=pv?async e=>{await pv(e);await f(e)}:f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},focus(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){handlers[sel+':change']=f},scrollHeight:0,scrollTop:0,disabled:false,textContent:'',srcdoc:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}},addEventListener(){}};
const store={};let n=0;const bodies=[];
const R='/sdcard/Chaman',UD=R+'/work/uploads/';
const calls2=[];let FETCH=async()=>({ok:true,status:200,json:async()=>({}),text:async()=>'',headers:{get:()=>''}});const DISK={};let access=true;const calls=[];
const rej=(code,message)=>Promise.reject(Object.assign(new Error(message),{code,message}));
const files=async(m,o)=>{
 calls.push(m+(o.append!=null?(o.append?'+':'0'):''));
 if(!access)return rej('NO_ACCESS','Chaman ko All files access nahi mili.');
 const p=o.path;
 if(m==='requestAccess')return{};
 if(m==='stat'){const t=DISK[p];return{path:p,exists:t!=null,dir:false,size:t==null?0:t.length}}
 if(m==='writeB64'){const d=Buffer.from(o.b64,'base64');if(!o.append){if(DISK[p]!=null)return rej('EXISTS','x');DISK[p]=d}else DISK[p]=Buffer.concat([DISK[p],d]);return{path:p,size:DISK[p].length}}
 if(m==='exportTo'){if(DISK[p]==null)return rej('NOT_FOUND','x');return{to:'/sdcard/Download/'+p.split('/').pop(),bytes:DISK[p].length}}
 if(m==='read'){const t=DISK[p];if(t==null)return rej('NOT_FOUND','x');const s=t.toString();return{path:p,text:s,lines:1,bytes:t.length,from:1,to:1,truncated:false}}
 return{};
};
const script=['Dekh liya.','Theek.','Ok.'];
const ctx={document:doc,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),TextDecoder,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>{const t=setTimeout(f,ms>10000?1e9:Math.min(ms,3));if(ms>10000)t.unref();return t},clearTimeout,URL,Image:function(){},
 fetch:async(u,o)=>{calls2.push({u,o});return FETCH(u,o)}};
ctx.window=ctx;
ctx.Capacitor={nativePromise:async(pl,m,o)=>{if(pl==='Files')return files(m,o);if(pl==='Termux')return{stdout:'',exitCode:0};return{}}};
vm.createContext(ctx);
process.chdir(__dirname+'/../www');
for(const f of ['prompts','core','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','intents','termuxapi','runner','imagegen','rules','log','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
const t=s=>vm.runInContext(s,ctx),getH=()=>t('H');
let fails=0;const ok=(c,l)=>{console.log((c?'PASS ':'FAIL ')+l);if(!c)fails++};
const PNG=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47]),Buffer.alloc(3000,7)]);
const jsonRes=j=>({ok:true,status:200,json:async()=>j,text:async()=>JSON.stringify(j),headers:{get:()=>'application/json'}});
(async()=>{
 // 1. no key
 let e='';try{await t('genImage("x")')}catch(x){e=x.message}
 ok(/NVIDIA ki key/.test(e),'no key -> clear message');
 t("S.keys.nvidia='nvapi-a, nvapi-b';");
 // 2. artifacts format, default url + payload
 FETCH=async(u,o)=>jsonRes({artifacts:[{base64:PNG.toString('base64'),finishReason:'SUCCESS',seed:0}]});
 let r=await t('genImage("a red cat")');
 const c=calls2[0],bd=JSON.parse(c.o.body);
 ok(c.u==='https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux-3-image-klein','url = genai base + default model id');
 ok(c.o.headers.Authorization==='Bearer nvapi-a'&&bd.prompt==='a red cat'&&bd.width===1024&&bd.height===1024&&bd.steps===50&&bd.seed===0,'payload matches NVIDIA sample');
 ok(/^\/sdcard\/Chaman\/work\/images\/img-\d{8}-\d{6}\.png$/.test(r.path)&&DISK[r.path].equals(PNG),'saved as png in work/images, byte-exact');
 // 3. editable model id
 t("S.img={model:'/black-forest-labs/flux.1-dev/',w:'768',h:'512',steps:'20'};");
 await t('genImage("b")');
 const c2=calls2[1],b2=JSON.parse(c2.o.body);
 ok(c2.u==='https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev'&&b2.width===768&&b2.height===512&&b2.steps===20,'edited model id/size/steps used');
 t("S.img={model:'bad model!'};");
 e='';try{await t('genImage("b")')}catch(x){e=x.message}
 ok(/model id galat/.test(e),'bad model id rejected before any request');
 t("S.img={};");
 // 4. other response shapes
 for(const [nm,j] of [['image',{image:PNG.toString('base64')}],['data[0].b64_json',{data:[{b64_json:PNG.toString('base64')}]}],['data url',{image:'data:image/png;base64,'+PNG.toString('base64')}]]){
  FETCH=async()=>jsonRes(j);const x=await t('genImage("c")');ok(DISK[x.path]&&DISK[x.path].equals(PNG),'response shape: '+nm);
 }
 FETCH=async()=>({ok:true,status:200,headers:{get:k=>/content-type/i.test(k)?'image/jpeg':''},arrayBuffer:async()=>{const b=Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(500,3)]);return b.buffer.slice(b.byteOffset,b.byteOffset+b.length)}});
 let x=await t('genImage("d")');ok(/\.jpg$/.test(x.path),'raw image/jpeg body -> .jpg');
 FETCH=async()=>jsonRes({artifacts:[{base64:'',finishReason:'CONTENT_FILTERED'}]});
 e='';try{await t('genImage("e")')}catch(y){e=y.message}ok(/CONTENT_FILTERED/.test(e),'filtered -> readable error');
 // 5. key rotation on 429, then both cooling
 let n=0;FETCH=async(u,o)=>{n++;if(o.headers.Authorization==='Bearer nvapi-a')return{ok:false,status:429,text:async()=>'rate',headers:{get:()=>''}};return jsonRes({image:PNG.toString('base64')})};
 t("for(const k in cool)delete cool[k]");
 x=await t('genImage("f")');ok(n===2&&DISK[x.path],'429 on key a -> key b used');
 FETCH=async()=>({ok:false,status:402,text:async()=>'payment',headers:{get:()=>''}});
 t("for(const k in cool)delete cool[k]");
 e='';try{await t('genImage("g")')}catch(y){e=y.message}ok(/HTTP 402/.test(e),'all keys fail -> last HTTP error shown');
 // 6. 202 polling
 t("for(const k in cool)delete cool[k]");
 let st=0;FETCH=async(u,o)=>{if(u.includes('pexec/status')){st++;return jsonRes({image:PNG.toString('base64')})}return{ok:true,status:202,headers:{get:k=>/NVCF-REQID/i.test(k)?'req-1':''},text:async()=>'',json:async()=>({})}};
 x=await t('genImage("h")');ok(st===1&&DISK[x.path],'202 -> polls status url and gets image');
 // 7. tool: card + FILE_TURN, errors
 t("for(const k in cool)delete cool[k]");
 FETCH=async()=>jsonRes({image:PNG.toString('base64')});
 const steps=[];t('FILE_TURN={w:"",p:{}}');
 const out=await t('execTool')('generate_image',{prompt:'poster'},steps);
 const card=getH().filter(m=>m.artifact&&m.artifact.kind==='img').pop();
 ok(card&&/work\/images\/img-/.test(card.artifact.path)&&/Card Najeef ko dikha diya/.test(out),'tool pushes an image card and tells the AI');
 ok(Object.keys(t('FILE_TURN.p')).length===1,'FILE_TURN marked so no duplicate auto card');
 ok(t('TOOLS.some(x=>x.function.name==="generate_image")'),'generate_image is in TOOLS');
 const o2=await t('execTool')('generate_image',{prompt:''},[]);ok(/Prompt nahi/.test(o2),'empty prompt refused');
 // 8. slash command
 ok(t('SLASH.some(c=>c.name==="image")&&SLASH.some(c=>c.name==="img")'),'/image and /img registered');
 const before=getH().length;
 await t('imageCmd')('ek jheel');
 const lastCard=getH().filter(m=>m.artifact).pop();
 ok(getH().length===before+1&&lastCard&&lastCard.artifact.title.startsWith('Image: ek jheel'),'/image adds one card, waiting note removed');
 FETCH=async()=>({ok:false,status:500,text:async()=>'boom',headers:{get:()=>''}});
 t("for(const k in cool)delete cool[k]");
 await t('imageCmd')('fail');
 ok(/Image fail: HTTP 500/.test(getH().slice(-1)[0].content),'/image failure shown as message');
 await t('imageCmd')('');
 ok(/Aise likho: \/image/.test(getH().slice(-1)[0].content),'/image without text shows usage');
 // 9. settings save
 t('sheet()');t("$('#im_m').value='black-forest-labs/other-model';$('#im_w').value='640';$('#im_h').value='640';$('#im_s').value='8';");
 await handlers['#save:click']();
 const ci=t('imgCfg()');
 ok(ci.model==='black-forest-labs/other-model'&&ci.w===640&&ci.h===640&&ci.steps===8&&t('S.img.model')==='black-forest-labs/other-model','Settings save stores model id, size, steps');
 ok(/genai\/"/.test(els['#sbody'].innerHTML)||/ai\.api\.nvidia\.com\/v1\/genai\//.test(els['#sbody'].innerHTML),'Settings shows fixed genai URL');
 console.log(fails?'FAILED '+fails:'ALL PASS');
})().catch(e=>{console.log('ERR',e);process.exit(1)});
