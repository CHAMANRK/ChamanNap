// Permission cards (step19): only readable+missing permissions are listed, one card at a time, Allow/Skip/Skip-all, auto-advance on grant,
// runtime denial -> App settings, waits for the keys card to close, remembered answers.
const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],classList:{contains(){return !!els[sel+'#open']},add(){els[sel+'#open']=1},remove(){delete els[sel+'#open']},toggle(){}},addEventListener(t,f){const k=sel+':'+t,pv=handlers[k];handlers[k]=pv?async e=>{await pv(e);await f(e)}:f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},focus(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){handlers[sel+':change']=f},scrollHeight:0,scrollTop:0,disabled:false,textContent:'',srcdoc:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}},addEventListener(){},removeEventListener(){}};
const store={};let n=0;const bodies=[];
const R='/sdcard/Chaman',UD=R+'/work/uploads/';
const calls2=[];let FETCH=async()=>({ok:true,status:200,json:async()=>({}),text:async()=>'',headers:{get:()=>''}});const DISK={},DL={};let access=true;const calls=[];
const rej=(code,message)=>Promise.reject(Object.assign(new Error(message),{code,message}));
const files=async(m,o)=>{
 calls.push(m+(o.append!=null?(o.append?'+':'0'):''));
 if(!access)return rej('NO_ACCESS','Chaman ko All files access nahi mili.');
 const p=o.path;
 if(m==='requestAccess')return{};
 if(m==='stat'){const t=DISK[p];return{path:p,exists:t!=null,dir:false,size:t==null?0:t.length}}
 if(m==='writeB64'){const d=Buffer.from(o.b64,'base64');if(!o.append){if(DISK[p]!=null)return rej('EXISTS','x');DISK[p]=d}else DISK[p]=Buffer.concat([DISK[p],d]);return{path:p,size:DISK[p].length}}
 if(m==='exportTo'){if(DISK[p]==null)return rej('NOT_FOUND','x');return{to:'/sdcard/Download/'+p.split('/').pop(),bytes:DISK[p].length}}
 if(m==='exportB64'){const d=Buffer.from(o.b64,'base64');let nm=o.name;if(!o.append){let k=1;const b=nm.replace(/\.(\w+)$/,''),x=(nm.match(/\.\w+$/)||[''])[0];while(DL[nm])nm=b+' ('+(k++)+')'+x;DL[nm]=d}else DL[nm]=Buffer.concat([DL[nm],d]);return{name:nm,to:'/sdcard/Download/'+nm,bytes:DL[nm].length}}
 if(m==='read'){const t=DISK[p];if(t==null)return rej('NOT_FOUND','x');const s=t.toString();return{path:p,text:s,lines:1,bytes:t.length,from:1,to:1,truncated:false}}
 return{};
};
const script=['Dekh liya.','Theek.','Ok.'];
const ctx={document:doc,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary'),TextDecoder,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,setTimeout:(f,ms)=>{const t=setTimeout(f,ms>10000?1e9:Math.min(ms,3));if(ms>10000)t.unref();return t},clearTimeout,URL,Image:function(){},
 fetch:async(u,o)=>{calls2.push({u,o});return FETCH(u,o)}};
const INT=[];let MO=null;
ctx.setInterval=f=>{INT.push(f);return INT.length};ctx.clearInterval=id=>{INT[id-1]=null};
ctx.MutationObserver=function(cb){this.observe=()=>{MO=cb};this.disconnect=()=>{MO=null}};
ctx.window=ctx;
const NAT={on:true,files:false,rt:{contacts:'prompt',smsRead:'prompt',smsSend:'prompt',call:'prompt'},grantRt:true,ws:false,a11y:false,overlay:false,termuxI:true,termuxP:false};const NL=[];
ctx.Capacitor={nativePromise:async(pl,m,o)=>{
 NL.push(pl+'.'+m);
 if(!NAT.on)throw new Error('Ye command sirf Android app me chalta hai.');
 if(pl==='Files'&&m==='status')return{granted:NAT.files,exists:true};
 if(pl==='Files'&&m==='requestAccess')return{};
 if(pl==='PhoneControl'&&m==='checkPermissions')return Object.assign({},NAT.rt);
 if(pl==='PhoneControl'&&m==='requestPermissions'){(o.permissions||[]).forEach(a=>{if(NAT.grantRt)NAT.rt[a]='granted'});return Object.assign({},NAT.rt)}
 if(pl==='PhoneControl'&&m==='specialStatus')return{writeSettings:NAT.ws};
 if(pl==='PhoneControl'&&m==='requestWriteSettings')return{};
 if(pl==='ScreenControl'&&m==='status')return{a11y:NAT.a11y,overlay:NAT.overlay};
 if(pl==='ScreenControl')return{};
 if(pl==='Termux'&&m==='status')return{installed:NAT.termuxI,permission:NAT.termuxP};
 if(pl==='Termux')return{};
 return{};
}};
vm.createContext(ctx);
process.chdir(__dirname+'/../www');
for(const f of ['version','prompts','core','status','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','intents','termuxapi','runner','imagegen','rules','log','perms','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
const t=s=>vm.runInContext(s,ctx);
let fails=0;const ok=(c,l)=>{console.log((c?'PASS ':'FAIL ')+l);if(!c)fails++};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const card=()=>els['#mcard'].innerHTML||'';
const click=async id=>{await handlers['#'+id+':click']();await sleep(5)};
(async()=>{
 await sleep(900); // startup pmStart(false) from perms.js (nothing readable? NAT on: it will show cards) -> reset below
 const reset=()=>{delete els['#modal#open'];els['#mcard'].innerHTML='';t('PM_RUN=false');delete store.nap_perm;INT.length=0};
 reset();
 ok(handlers['#pmr:click']===undefined,'#pmr handler is bound only when Settings is built (not at load)');
 // 1. no native -> nothing to ask
 NAT.on=false;let l=await t('pmPending')(true);ok(l.length===0,'no native bridge -> no cards');NAT.on=true;
 // 2. all off -> 8 cards in order
 l=await t('pmPending')(true);
 ok(l.map(x=>x.id).join()==='files,contacts,sms,call,wsettings,overlay,a11y,termux','all off: 8 permissions in order');
 // 3. some granted are not listed
 NAT.files=true;NAT.rt.contacts='granted';l=await t('pmPending')(true);
 ok(!l.some(x=>x.id==='files'||x.id==='contacts')&&l.length===6,'granted ones are not listed');
 NAT.files=false;NAT.rt.contacts='prompt';
 // 4. flow: card 1, Skip -> card 2, skip remembered
 await t('pmStart')(true);await sleep(20);
 ok(els['#modal#open']&&/Permission 1 \/ 8/.test(card())&&/All files access/.test(card()),'first card shown (1/8)');
 ok(/pmskip/.test(card())&&/pmgo/.test(card())&&/pmall/.test(card()),'card has Allow, Skip and Skip-all');
 await click('pmskip');
 ok(/Permission 2 \/ 8/.test(card())&&/Contacts/.test(card()),'Skip -> next card');
 ok(JSON.parse(store.nap_perm).files==='skip','skip is remembered');
 // 5. runtime allow: Allow -> granted -> auto next
 await click('pmgo');await sleep(900);
 ok(NL.includes('PhoneControl.requestPermissions')&&/Permission 3 \/ 8/.test(card())&&/SMS/.test(card()),'runtime Allow granted -> moved to next card by itself');
 ok(JSON.parse(store.nap_perm).contacts==='done','granted is remembered as done');
 // 6. runtime denied -> App settings
 NAT.grantRt=false;await click('pmgo');
 ok(/Allow nahi hua/.test(els['#pmst'].textContent),'denied: clear message');
 NL.length=0;await click('pmgo');
 ok(NL.includes('Termux.openAppInfo'),'second tap opens app settings');
 NAT.grantRt=true;
 await click('pmskip'); // sms skipped -> call
 ok(/Permission 4 \/ 8/.test(card())&&/Call karna/.test(card()),'next after denied+skip');
 await click('pmskip'); // call -> wsettings
 // 7. special permission opens settings, then interval check advances
 ok(/System settings/.test(card()),'special permission card');
 NL.length=0;await click('pmgo');ok(NL.includes('PhoneControl.requestWriteSettings'),'Allow opens the write-settings screen');
 NAT.ws=true;const f=INT.filter(Boolean).pop();await f();await sleep(900);
 ok(/Display over other apps/.test(card()),'coming back with permission on -> auto advance (overlay card)');
 // 8. skip all
 await click('pmall');
 ok(!els['#modal#open'],'Skip-all closes the card');
 const sv2=JSON.parse(store.nap_perm);ok(sv2.overlay==='skip'&&sv2.a11y==='skip'&&sv2.termux==='skip','remaining ones remembered as skipped');
 l=await t('pmPending')(false);ok(l.length===0,'skipped/done are not asked again on next launch');
 l=await t('pmPending')(true);ok(l.length>=5,'force (Settings button) asks the missing ones again');
 // 9. waits for the keys card
 reset();els['#modal#open']=1;
 await t('pmStart')(false);await sleep(20);
 ok(!/Permission/.test(card())&&MO,'keys card open -> permission cards wait');
 delete els['#modal#open'];await MO();await sleep(60);
 ok(/Permission 1 \/ \d/.test(card()),'keys card closed -> first permission card');
 // 10. everything granted -> no card at all
 reset();Object.assign(NAT,{files:true,ws:true,a11y:true,overlay:true,termuxP:true});['contacts','smsRead','smsSend','call'].forEach(a=>NAT.rt[a]='granted');
 await t('pmStart')(true);await sleep(20);ok(!els['#modal#open'],'all granted -> no cards');
 // 11. settings button
 t('sheet()');ok(/id="pmr"/.test(els['#sbody'].innerHTML)&&typeof handlers['#pmr:click']==='function','Settings has Permissions button');
 console.log(fails?'FAILED '+fails:'ALL PASS');process.exit(fails?1:0);
})().catch(e=>{console.log('ERR',e);process.exit(1)});
