// 1.51000.0 update detector: version parse/compare, GitHub release read (mocked fetch), popup + Baad me + throttle + auto switch,
// own-repo-only links, errors (404, rate limit, no internet, bad tag), Settings section, and the CI workflow wiring.
// Run from www: cd chaman-nap/www && node ../tests/sim-update.js
const vm=require('vm'),fs=require('fs');
const els={},handlers={};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],hidden:false,classList:{add(){els[sel+'#open']=1},remove(){delete els[sel+'#open']},toggle(){},contains(){return !!els[sel+'#open']}},addEventListener(t,f){const k=sel+':'+t,pv=handlers[k];handlers[k]=pv?async e=>{await pv(e);await f(e)}:f},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},appendChild(){},remove(){},select(){},click(){},focus(){},set onclick(f){handlers[sel+':click']=f},set onchange(f){handlers[sel+':change']=f},scrollHeight:0,scrollTop:0,disabled:false,textContent:'',srcdoc:''};let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}},addEventListener(){}};
const store={};
const sleepR=ms=>new Promise(r=>setTimeout(r,ms));
const APK='https://github.com/CHAMANRK/Chaman-Nap/releases/download/v1.52000.0/chaman-nap-v1.52000.0.apk';
const REL=()=>({tag_name:'v1.52000.0',name:'Chaman v1.52000.0',body:'**Step 52**: voice\n- mic',html_url:'https://github.com/CHAMANRK/Chaman-Nap/releases/tag/v1.52000.0',assets:[{name:'chaman-nap-v1.52000.0.apk',browser_download_url:APK}]});
let RESP={status:200,body:REL()},calls=0,lastReq=null,NET=false,OPENED=[],OPENFAIL=false,COPIED=[];
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{clipboard:{writeText:async x=>{COPIED.push(x)}}},console,
 setTimeout:(f,ms)=>{const t=setTimeout(f,ms>10000?1e9:ms<=250?ms:ms/40);if(ms>10000)t.unref();return t},clearTimeout,URL,Image:function(){},
 fetch:async(u,o)=>{
  if(/api\.github\.com/.test(u)){calls++;lastReq={u,o};if(NET)throw new Error('net down');return{ok:RESP.status<300,status:RESP.status,json:async()=>RESP.body}}
  return{ok:true,status:200,json:async()=>({choices:[{message:{role:'assistant',content:'x'}}]}),text:async()=>''}}};
ctx.window=ctx;
ctx.Capacitor={nativePromise:async(pl,m,o)=>{
  if(pl==='PhoneControl'&&m==='openUrl'){if(OPENFAIL){const e=new Error('no app');e.code='NOT_FOUND';throw e}OPENED.push(o.uri);return{}}
  if(pl==='Termux')return{stdout:'',exitCode:0};return{}}};
vm.createContext(ctx);
process.chdir(__dirname+'/../www');
for(const f of ['version','prompts','core','status','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','intents','termuxapi','runner','imagegen','sched','crules','ui','rules','connector','update','anim','log','syntax','devui','dock','sessions','face','bubble','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
const t=s=>vm.runInContext(s,ctx);
let fails=0;const ok=(c,l)=>{console.log((c?'PASS ':'FAIL ')+l);if(!c)fails++};
const reset=()=>{t('S.up={}');t('UP.info=null;UP.busy=false');delete els['#modal#open'];els['#mcard']&&(els['#mcard'].innerHTML='');RESP={status:200,body:REL()};NET=false;OPENED=[];OPENFAIL=false;COPIED=[];calls=0};
(async()=>{
 await sleepR(150); // the start-up auto check (timer) has run once; reset before the real tests
 // ---------- parse / compare ----------
 ok(JSON.stringify(t("upParse('v1.51000.0')"))==='[1,51000,0]','upParse reads v-prefixed tag');
 ok(JSON.stringify(t("upParse('1.51000.2')"))==='[1,51000,2]','upParse reads plain version');
 ok(t("upParse('latest')")===null&&t("upParse('v1.2')")===null&&t("upParse('')")===null&&t("upParse(null)")===null,'upParse refuses non-versions');
 ok(t("upCmp(upParse('1.51000.0'),upParse('1.50000.0'))")===1,'feature number decides (51000 > 50000)');
 ok(t("upCmp(upParse('1.50000.1'),upParse('1.50000.0'))")===1,'fix number decides');
 ok(t("upCmp(upParse('2.01000.0'),upParse('1.99000.9'))")===1,'big version decides');
 ok(t("upCmp(upParse('1.51000.0'),upParse('1.51000.0'))")===0,'equal versions');
 ok(t("upCmp(upParse('1.9000.0'),upParse('1.51000.0'))")===-1,'numeric, not text, compare');
 ok(t("upSafe('https://github.com/CHAMANRK/Chaman-Nap/releases/x')")===true&&t("upSafe('https://github.com/chamanrk/chaman-nap/releases/x')")===true,'own repo link is safe (case-insensitive)');
 ok(t("upSafe('https://github.com/evil/Chaman-Nap/releases/x')")===false&&t("upSafe('https://evil.com/https://github.com/CHAMANRK/Chaman-Nap/')")===false&&t("upSafe('http://github.com/CHAMANRK/Chaman-Nap/x')")===false,'other repo / other host / http refused');
 // ---------- newer release ----------
 reset();
 let r=await t('upCheck()');
 ok(r.ok&&r.newer&&r.ver==='1.52000.0'&&r.apk&&r.url===APK,'newer release found with apk link');
 ok(lastReq.u==='https://api.github.com/repos/CHAMANRK/Chaman-Nap/releases/latest'&&/vnd\.github/.test(lastReq.o.headers.Accept),'asks the latest-release API of the repo, no token');
 ok(!/Authorization/i.test(JSON.stringify(lastReq.o.headers)),'no auth header (public repo)');
 ok(t('S.up.seen')==='v1.52000.0'&&t('S.up.last')>0,'seen tag and check time saved');
 ok(/Step 52/.test(r.notes)&&!/\*\*/.test(r.notes),'release notes are shown as plain text');
 ok(/Naya version hai: v1\.52000\.0/.test(t('upLine(UP.info)')),'settings line says a new version exists');
 // ---------- same / older / not a version ----------
 reset();RESP.body.tag_name='v1.51000.0';r=await t('upCheck()');
 ok(r.ok&&!r.newer&&/latest pe ho/.test(t('upLine(UP.info)')),'same version = latest');
 reset();RESP.body.tag_name='v1.49000.3';r=await t('upCheck()');
 ok(r.ok&&!r.newer,'older release is not an update');
 reset();RESP.body.tag_name='nightly';r=await t('upCheck()');
 ok(!r.ok&&/version jaisa nahi/.test(r.msg),'bad tag is explained');
 // ---------- errors ----------
 reset();RESP={status:404,body:{}};r=await t('upCheck()');
 ok(!r.ok&&/koi release nahi/.test(r.msg),'404 = no release yet, tells how to make one');
 reset();RESP={status:403,body:{}};r=await t('upCheck()');
 ok(!r.ok&&/limit/.test(r.msg),'403 = rate limit message');
 reset();RESP={status:500,body:{}};r=await t('upCheck()');
 ok(!r.ok&&/HTTP 500/.test(r.msg),'other HTTP error shown');
 reset();NET=true;r=await t('upCheck()');
 ok(!r.ok&&/Internet/.test(r.msg),'no internet is explained, no throw');
 ok(!t('S.up.last'),'failed check does not set the 6-hour timer');
 // ---------- links from another repo are never offered ----------
 reset();RESP.body.assets=[{name:'x.apk',browser_download_url:'https://evil.example/x.apk'}];RESP.body.html_url='https://evil.example/r';
 r=await t('upCheck()');
 ok(r.ok&&r.url===''&&!r.apk,'foreign asset and page links are dropped');
 reset();RESP.body.assets=[];
 r=await t('upCheck()');
 ok(r.ok&&!r.apk&&/releases\/tag/.test(r.url),'no apk asset -> release page link');
 // ---------- auto check: popup, Baad me, throttle, switch ----------
 reset();
 r=await t('upAuto()');
 ok(r&&r.newer&&els['#modal#open']===1,'auto check opens the popup for a newer version');
 const card=els['#mcard'].innerHTML;
 ok(/v1\.52000\.0/.test(card)&&/v1\.51000\.0/.test(card)&&/APK download karo/.test(card)&&/Baad me/.test(card)&&/Step 52/.test(card),'popup shows new + current version, notes, Download and Baad me');
 await handlers['#upd:click']();await sleepR(5);
 ok(OPENED.length===1&&OPENED[0]===APK,'Download opens the apk link of our repo');
 ok(!els['#modal#open'],'popup closes after Download');
 // Baad me
 reset();await t('upAuto()');
 await handlers['#upl:click']();
 ok(!els['#modal#open']&&t('S.up.skip')==='v1.52000.0','Baad me closes and remembers this tag');
 t('S.up.last=0');delete els['#modal#open'];
 await t('upAuto()');
 ok(!els['#modal#open'],'same tag is not shown again after Baad me');
 RESP.body.tag_name='v1.53000.0';t('S.up.last=0');
 await t('upAuto()');
 ok(els['#modal#open']===1,'a newer tag after Baad me shows the popup again');
 // throttle
 reset();await t('upAuto()');delete els['#modal#open'];const c1=calls;
 await t('upAuto()');
 ok(calls===c1,'second auto check within 6 hours makes no request');
 t('S.up.last=Date.now()-7*3600*1000');await t('upAuto()');
 ok(calls===c1+1,'after 6 hours it checks again');
 // switch off
 reset();t('S.up.on=false');await t('upAuto()');
 ok(calls===0&&!els['#modal#open'],'auto check Off: no request, no popup');
 // silent failure
 reset();NET=true;await t('upAuto()');
 ok(!els['#modal#open'],'auto check fails silently (no popup, no error)');
 // not newer = no popup
 reset();RESP.body.tag_name='v1.51000.0';await t('upAuto()');
 ok(!els['#modal#open'],'no popup when already latest');
 // another modal already open (first-run key import) is not covered
 reset();els['#modal#open']=1;els['#mcard'].innerHTML='KEYS';await t('upAuto()');
 ok(els['#mcard'].innerHTML==='KEYS','auto popup does not replace a modal that is already open');
 // ---------- opening the link ----------
 reset();OPENFAIL=true;
 ok((await t("upOpen('"+APK+"')"))===false&&COPIED[0]===APK,'if no app can open the link it is copied');
 reset();
 ok((await t("upOpen('https://evil.example/a.apk')"))===false&&OPENED.length===0,'upOpen refuses a foreign link');
 // ---------- Settings ----------
 reset();
 const h=t('upSettingsHtml()');
 ok(/App update/.test(h)&&/id="upc"/.test(h)&&/id="up_on"/.test(h)&&/id="upt"/.test(h)&&/id="upg" hidden/.test(h),'Settings section has check, auto switch, popup test, hidden download');
 const sh=t('sheet(),$("#sbody").innerHTML');
 ok(/App update/.test(sh)&&/Chaman v1\.51000\.0/.test(sh),'section is inside the real Settings sheet, version line intact');
 ok(typeof handlers['#upc:click']==='function','sheet binds the check button');
 await handlers['#upc:click']();await sleepR(10);
 ok(/Naya version hai/.test(els['#ups'].textContent)&&els['#upg'].hidden===false,'manual check shows the new version and the Download button');
 await handlers['#upg:click']();await sleepR(5);
 ok(OPENED[0]===APK,'Settings Download opens the apk');
 t('$("#up_on").value="off"');handlers['#up_on:change']();
 ok(t('S.up.on')===false,'auto switch Off is saved');
 t('$("#up_on").value="on"');handlers['#up_on:change']();
 ok(t('S.up.on')===true,'auto switch On is saved');
 delete els['#modal#open'];await handlers['#upt:click']();
 ok(els['#modal#open']===1&&/TEST popup/.test(els['#mcard'].innerHTML)&&/9\.99000\.0/.test(els['#mcard'].innerHTML),'popup test shows a fake new version');
 await handlers['#upl:click']();
 ok(t('S.up.skip')!=='v9.99000.0','Baad me on the fake popup does not store a skip');
 // ---------- version + CI wiring ----------
 const pj=JSON.parse(fs.readFileSync('../package.json','utf8'));
 ok(t('APP_VER')===pj.version,'version.js and package.json agree ('+pj.version+')');
 const y=fs.readFileSync('../.github/workflows/build.yml','utf8');
 ok(/tags:\s*\['v\*'\]/.test(y)&&/contents:\s*write/.test(y),'workflow runs on v* tags and can write releases');
 ok(/gh release create/.test(y)&&/gh release upload .*--clobber/.test(y)&&/github\.token/.test(y)&&!/secrets\.GH|PAT|ghp_/.test(y),'release step uses the built-in token only');
 ok(/startsWith\(github\.ref, 'refs\/tags\/v'\)/.test(y)&&/package\.json/.test(y.split('Release (sirf')[0]),'tag must match package.json, release only on tags');
 ok(/DEBUG_KEYSTORE_B64/.test(y)&&/Check APK signature/.test(y),'fixed-key signing and signature check untouched');
 const html=fs.readFileSync('index.html','utf8');
 ok(/js\/connector\.js"><\/script>\s*<script src="js\/update\.js"><\/script>/.test(html),'update.js is loaded in index.html');
 const src=fs.readFileSync('js/update.js','utf8');
 ok(!/localStorage|ghp_|github_pat|Bearer/.test(src),'no token and no direct storage in update.js');
 console.log(fails?('FAILS: '+fails):'ALL PASS');
 process.exit(fails?1:0);
})().catch(e=>{console.log('CRASH',e);process.exit(2)});
