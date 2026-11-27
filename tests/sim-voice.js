// 1.52000.0 Voice v0.1: mic -> message -> AI reply -> TTS. Run: cd chaman-nap/www && node ../tests/sim-voice.js
// Native Voice plugin is mocked: listen / ttsFetch / play / speakAndroid / stopSpeak / discard / elGet.
const vm=require('vm'),fs=require('fs');
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('PASS',m)}else{fail++;console.log('FAIL',m)}};
const handlers={},els={};
const add=(sel,t,f)=>{(handlers[sel+':'+t]=handlers[sel+':'+t]||[]).push(f)};
const mk=sel=>{const o={value:'',style:{},dataset:{},options:[],hidden:false,classList:{add(){},remove(){},toggle(){}},addEventListener(t,f){add(sel,t,f)},insertAdjacentHTML(){},querySelector(){return mk('x')},closest(){return null},setAttribute(){},
  dispatchEvent(e){(handlers[sel+':'+e.type]||[]).forEach(f=>f({type:e.type,preventDefault(){},target:o}))}};
  let h='';Object.defineProperty(o,'innerHTML',{get(){return h},set(v){h=v;if(sel==='#prov')o.options=v.split('<option').slice(1)}});return o};
const doc={querySelector:s=>els[s]||(els[s]=mk(s)),createElement:()=>mk('c'),body:mk('body'),documentElement:{dataset:{}},hidden:false,addEventListener(){}};
const store={};
let script=[],n=0;
const calls=[];
let LISTEN={text:'aaj ka mausam batao'},ELFAIL={},PLAYWAIT=null,ELCALLS=0,ANDROID_FAIL=false;
const ctx={document:doc,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=v}},matchMedia:()=>({matches:true,addEventListener(){}}),navigator:{},console,
  setTimeout:(f,ms)=>setTimeout(f,Math.min(ms,3)),clearTimeout,setInterval,clearInterval,URL,Image:function(){},
  Event:class{constructor(t,o){this.type=t;Object.assign(this,o||{})}},
  fetch:async()=>{const s=script[n++]||{msg:'(sim: script khatam)'};return{ok:true,status:200,json:async()=>({choices:[{message:{role:'assistant',content:s.msg}}]}),text:async()=>''}}};
ctx.window=ctx;
const err=(m,code)=>Object.assign(new Error(m),{code});
ctx.Capacitor={nativePromise:async(pl,m,o)=>{
  calls.push({pl,m,o});
  if(pl!=='Voice')return m==='bubble'?{ok:false}:{};
  if(m==='listen'){if(LISTEN.err)throw err(LISTEN.err,LISTEN.code);return LISTEN}
  if(m==='ttsFetch'){ELCALLS++;const f=ELFAIL[o.key];if(f)throw err('HTTP '+f+' x',String(f));return{path:'/cache/vc_'+ELCALLS+'.mp3'}}
  if(m==='play'){if(PLAYWAIT)await PLAYWAIT;return{done:true}}
  if(m==='speakAndroid'){if(ANDROID_FAIL)throw err('no tts','NO_TTS');return{done:true}}
  if(m==='elGet')return{items:o.what==='voices'?[{id:'voiceA1',name:'Anaya',info:'premade'}]:[{id:'eleven_multilingual_v2',name:'Multilingual v2',info:'29 languages'}]};
  return{}}};
vm.createContext(ctx);
for(const f of ['version','prompts','core','status','providers','chat','settings','attach','keys','helpers','phone','tools','termux','workspace','files','notes','slash','fast','intents','termuxapi','runner','rules','log','bubble','voice','main'])vm.runInContext(fs.readFileSync('js/'+f+'.js','utf8'),ctx,{filename:f+'.js'});
const ev=c=>vm.runInContext(c,ctx);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const idle=async()=>{for(let i=0;i<300&&(ev('busy')||ev('VC.st')!=='idle');i++)await sleep(5);await sleep(15)};
const all=m=>calls.filter(c=>c.m===m);
const reset=()=>{calls.length=0;n=0;ELCALLS=0;ELFAIL={};PLAYWAIT=null;ANDROID_FAIL=false;LISTEN={text:'aaj ka mausam batao'};ev("VC.ptr=0;VC.note=false;VC.vid='';for(const k in cool)delete cool[k];H=[]")};

(async()=>{
  ev("S.keys.groq='g1';S.prov='groq';");
  // ---------- text cleaning ----------
  const cl=s=>ev('vcClean('+JSON.stringify(s)+')');
  ok(cl('Ye dekho:\n```js\nconst a=1;\n```\nBas itna.')==='Ye dekho:\nBas itna.','code block skipped');
  ok(!/const|never/.test(cl('Pehle ye.\n```py\nprint(1)\nnever closed')),'unterminated code block skipped');
  ok(cl('Naam | Umar\n--- | ---\n| Ali | 5 |\nTable ke baad.')==='Table ke baad.','table rows skipped');
  ok(cl('Dekho [Google](https://google.com) aur https://x.com/a?b=1 par.')==='Dekho Google aur par.','link text kept, urls dropped: '+cl('Dekho [Google](https://google.com) aur https://x.com/a?b=1 par.'));
  ok(cl('## Heading\n**bold** aur `code` text')==='Heading\nbold aur code text','markdown symbols removed: '+JSON.stringify(cl('## Heading\n**bold** aur `code` text')));
  ok(cl('- ek\n- do\n1. teen')==='ek\ndo\nteen','bullets lose their marker');
  ok(cl('Done \u{1F600}✅ ok')==='Done ok','emoji dropped');
  ok(cl('```\nonly code\n```')==='','only code -> nothing to speak');
  // ---------- chunks ----------
  const ch=ev("vcChunks('Pehla vakya. Doosra vakya! Teesra?')");
  ok(ch.length===1&&ch[0]==='Pehla vakya. Doosra vakya! Teesra?','short text = one piece');
  const long=Array.from({length:40},(_,i)=>'Ye vakya number '+i+' hai.').join(' ');
  const c2=ev('vcChunks('+JSON.stringify(long)+')');
  ok(c2.length>1&&c2.every(x=>x.length<=450),'long text split, each <= 450 ('+c2.length+' pieces, max '+Math.max(...c2.map(x=>x.length))+')');
  ok(c2.join(' ').replace(/\s+/g,' ')===long,'no text lost when splitting');
  const huge=ev("vcChunks('abc '.repeat(5000))");
  ok(huge.join('').length<=3200,'total spoken text is capped');
  ok(ev("vcChunks('x'.repeat(1000)).every(p=>p.length<=450)"),'one giant word is still cut');
  ok(ev("vcChunks('Pehle. Hindi । doosra ।').length")>=1&&ev("vcChunks('Haan । Nahi ।')[0]").length>0,'danda sentence end works');
  ok(ev("vcLang('नमस्ते')")==='hi-IN'&&ev("vcLang('hello')")==='en-IN','language by script');

  // ---------- mic -> message -> reply -> ElevenLabs, key rotation ----------
  reset();
  ev("S.vc={keys:'k1, k2',voice:'voiceX',model:'mdl_test',speed:1.1,say:'mic',engine:'eleven',lang:'hi-IN',on:true}");
  ELFAIL={k1:429};
  script=[{msg:'Aaj saaf mausam hai. Dhoop nikli hai.'}];
  await ev('vcMic()');await idle();
  const lis=all('listen');
  ok(lis.length===1&&lis[0].o.lang==='hi-IN','listen called with the language setting');
  const H=ev('H.map(x=>({role:x.role,content:x.content,voice:x.voice,info:x.info}))');
  ok(H.some(x=>x.role==='user'&&x.content==='aaj ka mausam batao'),'spoken text became a normal user message');
  ok(H.find(x=>x.role==='user').voice===1&&!/voice mode/.test(H.find(x=>x.role==='user').content),'user message marked voice, hint not in the visible text');
  ok(H.some(x=>x.role==='assistant'&&x.content==='Aaj saaf mausam hai. Dhoop nikli hai.'),'AI answered');
  const tts=all('ttsFetch');
  ok(tts.length===2&&tts[0].o.key==='k1'&&tts[1].o.key==='k2','k1 got 429, rotation moved to k2');
  ok(tts[1].o.voice==='voiceX'&&tts[1].o.model==='mdl_test'&&tts[1].o.speed===1.1&&tts[1].o.text==='Aaj saaf mausam hai. Dhoop nikli hai.','voice, model, speed and cleaned text sent');
  ok(all('play').length===1&&/vc_2\.mp3/.test(all('play')[0].o.path),'the downloaded mp3 was played');
  ok(all('speakAndroid').length===0,'no Android fallback when ElevenLabs works');
  ok(ev("cool['k1']")>Date.now()+30000,'429 key is on cooldown (60 s)');
  ok(!ev('H').some(x=>x.info),'no warning message when a key failed but another worked');
  // the AI request had the hint on the last user message
  const am=ev('apiMsgs(false)');
  ok(/voice mode/.test(am.filter(x=>x.role==='user').pop().content),'AI request: last mic message carries the short-reply hint');
  // second reply: k1 is skipped (cooldown), no 429 call again
  calls.length=0;script=[{msg:'Theek hai.'}];n=0;LISTEN={text:'dhanyavaad'};
  await ev('vcMic()');await idle();
  ok(all('ttsFetch').length===1&&all('ttsFetch')[0].o.key==='k2','next reply goes straight to k2 (k1 cooling down)');
  ok(!/voice mode/.test(ev('apiMsgs(false)').filter(x=>x.role==='user')[0].content),'hint is only on the newest message, not on old ones');

  // ---------- typed message is not spoken (say = mic) ----------
  calls.length=0;script=[{msg:'Typed jawab.'}];n=0;
  els['#in']=els['#in']||mk('#in');els['#in'].value='typed sawal';
  await handlers['#f:submit'][0]({preventDefault(){}});await idle();
  ok(all('ttsFetch').length===0&&all('speakAndroid').length===0,'typed message: reply is not spoken (say=mic)');
  const lastU=ev("H.filter(x=>x.role==='user').pop()");
  ok(!lastU.voice,'typed message is not marked voice');
  // say = all
  ev("S.vc.say='all'");calls.length=0;script=[{msg:'Ab bolunga.'}];n=0;els['#in'].value='phir typed';
  await handlers['#f:submit'][0]({preventDefault(){}});await idle();
  ok(all('play').length===1,'say=all: typed message reply is spoken');
  // say = off
  ev("S.vc.say='off'");calls.length=0;script=[{msg:'Chup.'}];n=0;LISTEN={text:'mic se'};
  await ev('vcMic()');await idle();
  ok(all('ttsFetch').length===0&&all('play').length===0,'say=off: nothing spoken even for a mic message');
  ev("S.vc.say='mic'");

  // ---------- skip code / links in the spoken reply ----------
  reset();ev("S.vc={keys:'k1',voice:'v1xx',model:'m_ok',speed:1,say:'mic',engine:'eleven',lang:'hi-IN',on:true}");
  script=[{msg:'Ye lo code:\n```py\nprint(1)\n```\nLink https://x.com par hai.'}];
  await ev('vcMic()');await idle();
  const t2=all('ttsFetch');
  ok(t2.length===1&&t2[0].o.text==='Ye lo code:\nLink par hai.'||t2[0].o.text==='Ye lo code: Link par hai.','spoken text has no code and no link: '+JSON.stringify(t2[0]&&t2[0].o.text));
  reset();ev("S.vc={keys:'k1',voice:'v1xx',model:'m_ok',speed:1,say:'mic',engine:'eleven',lang:'hi-IN',on:true}");
  script=[{msg:'```\nsirf code\n```'}];
  await ev('vcMic()');await idle();
  ok(all('ttsFetch').length===0&&all('speakAndroid').length===0,'reply that is only code: nothing spoken');

  // ---------- all keys fail -> Android fallback, one note ----------
  reset();ev("S.vc={keys:'k1, k2',voice:'v1xx',model:'m_ok',speed:1,say:'mic',engine:'eleven',lang:'hi-IN',on:true}");
  ELFAIL={k1:401,k2:429};script=[{msg:'Pehla vakya. Doosra vakya.'}];
  await ev('vcMic()');await idle();
  ok(all('play').length===0&&all('speakAndroid').length===1&&all('speakAndroid')[0].o.text==='Pehla vakya. Doosra vakya.','ElevenLabs failed -> Android TTS spoke');
  ok(ev("H.filter(x=>x.info&&/ElevenLabs fail/.test(x.content)).length")===1,'one chat note says ElevenLabs failed');
  ok(!/k1|k2/.test(ev("H.filter(x=>x.info).map(x=>x.content).join(' ')")),'note does not contain a key');
  ok(ev("cool['k1']")>Date.now()+500000,'401 key cools down 10 min');
  // multi-piece reply: after a failure the REST goes to Android, no more ElevenLabs calls
  reset();ev("S.vc={keys:'k1',voice:'v1xx',model:'m_ok',speed:1,say:'mic',engine:'eleven',lang:'hi-IN',on:true}");
  ELFAIL={k1:500};script=[{msg:long}];
  await ev('vcMic()');await idle();
  ok(all('ttsFetch').length===1&&all('speakAndroid').length===ev("vcChunks(vcClean("+JSON.stringify(long)+")).length"),'after one failure every piece uses Android (1 ElevenLabs try only)');
  // engine android
  reset();ev("S.vc={keys:'k1',voice:'v1xx',model:'m_ok',speed:1,say:'mic',engine:'android',lang:'hi-IN',on:true}");
  script=[{msg:'Android se bolo.'}];await ev('vcMic()');await idle();
  ok(all('ttsFetch').length===0&&all('speakAndroid').length===1,'engine=android: no ElevenLabs call');
  // no keys at all
  reset();ev("S.vc={keys:'',voice:'',model:'m_ok',speed:1,say:'mic',engine:'eleven',lang:'hi-IN',on:true}");
  script=[{msg:'Bina key.'}];await ev('vcMic()');await idle();
  ok(all('ttsFetch').length===0&&all('speakAndroid').length===1&&!ev('H').some(x=>x.info),'no ElevenLabs key: Android speaks, no scary warning');
  // Android also fails -> a note, state returns to idle
  ANDROID_FAIL=true;reset();ANDROID_FAIL=true;ev("S.vc={keys:'',voice:'',model:'m_ok',speed:1,say:'mic',engine:'android',lang:'hi-IN',on:true}");
  script=[{msg:'Kuch nahi bolega.'}];await ev('vcMic()');await idle();
  ok(ev('VC.st')==='idle'&&ev("H.some(x=>x.info&&/Voice fail/.test(x.content))"),'Android TTS failure -> note, mic back to idle');
  // empty voice id -> first voice of the account is used
  reset();ev("S.vc={keys:'k1',voice:'',model:'m_ok',speed:1,say:'mic',engine:'eleven',lang:'hi-IN',on:true}");
  script=[{msg:'Voice khaali.'}];await ev('vcMic()');await idle();
  ok(all('elGet').length===1&&all('elGet')[0].o.what==='voices'&&all('ttsFetch')[0].o.voice==='voiceA1','empty voice id: first voice taken from the real voices list');

  // ---------- stop while speaking ----------
  reset();ev("S.vc={keys:'k1',voice:'v1xx',model:'m_ok',speed:1,say:'mic',engine:'eleven',lang:'hi-IN',on:true}");
  let rel;PLAYWAIT=new Promise(r=>{rel=r});script=[{msg:long}];
  await ev('vcMic()');await sleep(60);
  ok(ev('VC.st')==='speak'&&all('play').length===1,'speaking: first piece is playing');
  ok(all('ttsFetch').length===2,'next piece was prefetched while the first plays');
  await ev('vcMic()');   // mic button = stop while speaking
  ok(all('stopSpeak').length>=1&&ev('VC.st')==='idle','mic button while speaking = stop');
  rel();PLAYWAIT=null;await sleep(40);
  ok(all('play').length===1,'no further piece played after Stop');
  ok(all('discard').length===1,'prefetched audio of the stopped piece is discarded');

  // ---------- mic errors ----------
  reset();LISTEN={err:'Mic permission nahi mili.',code:'PERMISSION'};
  await ev('vcMic()');await sleep(20);
  ok(ev("H.some(x=>x.info&&/Mic permission/.test(x.content))")&&ev('VC.st')==='idle'&&ev("!H.some(x=>x.role==='user')"),'permission denied: note, nothing sent');
  reset();LISTEN={text:'',reason:'no_speech'};
  await ev('vcMic()');await sleep(20);
  ok(ev("H.some(x=>x.info&&/Kuch suna nahi/.test(x.content))")&&ev("!H.some(x=>x.role==='user')"),'nothing heard: note, nothing sent');
  // tap while listening = stop listening (native returns what was heard)
  reset();let lr;LISTEN=null;
  ctx.Capacitor.nativePromise=(old=>async(pl,m,o)=>{if(pl==='Voice'&&m==='listen'){calls.push({pl,m,o});return new Promise(r=>{lr=r})}return old(pl,m,o)})(ctx.Capacitor.nativePromise);
  const p=ev('vcMic()');await sleep(10);
  ok(ev('VC.st')==='listen','listening state while mic is open');
  await ev('vcMic()');
  ok(all('stopListen').length===1,'second tap asks native to stop listening');
  script=[{msg:'Sun liya.'}];lr({text:'adhura bola'});await p;await idle();
  ok(ev("H.some(x=>x.role==='user'&&x.content==='adhura bola')"),'what was heard so far is still sent');
  // mic while AI is busy does nothing
  reset();ev("busy=true");const before=calls.length;await ev('vcMic()');ev("busy=false");
  ok(calls.length===before,'mic does nothing while an AI turn is running');
  // voice off
  reset();ev("S.vc={keys:'k1',on:false}");const b2=calls.length;await ev('vcMic()');
  ok(calls.length===b2,'Voice off: mic does nothing');

  // ---------- live mode (1.53000.0) ----------
  ev("var LIVELOG=[];function cwLive(s){LIVELOG.push(s)}");
  let LQ=null,hang=null;
  ctx.Capacitor.nativePromise=(old=>async(pl,m,o)=>{
    if(pl==='Voice'&&m==='stopListen'){calls.push({pl,m,o});const h=hang;hang=null;if(h)h({text:'',reason:'cancelled'});return{}}
    if(pl==='Voice'&&m==='listen'&&LQ){calls.push({pl,m,o});if(LQ.length){const x=LQ.shift();if(x.err)throw err(x.err,x.code);return x}return new Promise(r=>{hang=r})}
    return old(pl,m,o)})(ctx.Capacitor.nativePromise);
  const waitFor=async(f,ms)=>{const t0=Date.now();while(Date.now()-t0<(ms||2500)){if(f())return true;await sleep(5)}return false};
  const seq=()=>calls.filter(c=>c.m==='listen'||c.m==='speakAndroid').map(c=>c.m).join();
  const liveReset=()=>{reset();doc.hidden=false;ev("S.vc={engine:'android',on:true};VC.live=false;VC.waitTurn=false;LIVELOG.length=0");LQ=[];hang=null};
  // A: listen -> AI -> speak -> listen again, twice, then the third listen waits (open mic)
  liveReset();LQ=[{text:'pehla sawal'},{text:'doosra sawal'}];script=[{msg:'Pehla jawab.'},{msg:'Doosra jawab.'}];
  ev('vcLiveStart()');
  ok(await waitFor(()=>all('listen').length>=3&&all('speakAndroid').length>=2),'live: loop reached the third listen after two full rounds');
  ok(seq()==='listen,speakAndroid,listen,speakAndroid,listen','order: listen, speak, listen, speak, listen (mic never opens while speaking)');
  ok(ev("H.filter(x=>x.role==='user').map(x=>x.content).join()")==='pehla sawal,doosra sawal'&&ev("H.filter(x=>x.role==='assistant'&&!x.info).length")===2,'both spoken messages went through the normal chat path');
  ok(ev('VC.live')===true&&ev("LIVELOG.includes('listen')&&LIVELOG.includes('speak')&&LIVELOG.includes('think')"),'ring told: listen, think (AI wait) and speak states ('+ev("[...new Set(LIVELOG)].join()")+')');
  ok(ev("document.querySelector('#micb')&&true"),'mic button exists');
  ev('vcLiveStop()');await sleep(20);
  ok(ev('VC.live')===false&&all('stopListen').length>=1&&ev('LIVELOG[LIVELOG.length-1]')==='','stop: no longer live, mic asked to stop, ring off');
  const n0=all('listen').length;await sleep(40);ok(all('listen').length===n0,'after stop no new listen starts');
  // B: two empty listens in a row end live mode by themselves
  liveReset();LQ=[{text:'',reason:'no_speech'},{text:'',reason:'no_speech'}];
  ev('vcLiveStart()');
  ok(await waitFor(()=>!ev('VC.live')),'two silent listens in a row stop live mode');
  ok(all('listen').length===2&&ev("H.some(x=>x.info&&/Live mode band/.test(x.content))"),'exactly two listens, one short note in chat');
  // one silence, then speech: counter resets, no stop
  liveReset();LQ=[{text:'',reason:'no_speech'},{text:'ab bolta hu'}];script=[{msg:'Haan.'}];
  ev('vcLiveStart()');
  ok(await waitFor(()=>all('listen').length>=3&&all('speakAndroid').length>=1)&&ev('VC.live')===true,'one silence does not stop live; the next speech is handled');
  ev('vcLiveStop()');await sleep(20);
  // C: mic permission error stops live
  liveReset();LQ=[{err:'Mic permission nahi hai',code:'PERMISSION'}];
  ev('vcLiveStart()');
  ok(await waitFor(()=>!ev('VC.live'))&&ev("H.some(x=>x.info&&/permission/i.test(x.content))"),'permission error stops live and tells why');
  // D: a typed message ends live mode
  liveReset();LQ=[];script=[{msg:'Likha mila.'}];
  ev('vcLiveStart()');await waitFor(()=>all('listen').length>=1);
  ev("$('#in').value='likha hua sawal';$('#f').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}))");
  ok(await waitFor(()=>!ev('VC.live')),'typing a message ends live mode');
  await idle();ok(ev("H.some(x=>x.role==='user'&&x.content==='likha hua sawal')"),'typed message still goes through');
  // E: Stop button of a turn ends live mode
  liveReset();LQ=[];ev('vcLiveStart()');await waitFor(()=>all('listen').length>=1);
  ev('vcOnStop()');ok(await waitFor(()=>!ev('VC.live')),'Stop (vcOnStop) ends live mode');
  ok(/vcOnStop\(\)/.test(fs.readFileSync('js/chat.js','utf8').split('function stopTurn')[1].split('\n}\n')[0]),'chat.js stopTurn calls vcOnStop');
  // F: confirm card waiting for a tap pauses the loop, resumes after it
  liveReset();LQ=[{text:'phir se'}];script=[{msg:'Theek.'}];
  ev("H.push({role:'assistant',content:'SMS bhejna hai',confirm:{state:'pending'}})");
  ev('vcLiveStart()');await sleep(80);
  ok(all('listen').length===0&&ev('VC.live')===true,'confirm card pending: mic stays closed');
  ok(ev("LIVELOG[LIVELOG.length-1]")==='think','ring keeps beating while a card waits for his tap');
  ev("H[0].confirm.state='done'");
  ok(await waitFor(()=>all('listen').length>=1),'after the tap the loop goes on');
  ev('vcLiveStop()');await sleep(20);
  // G: app in background: waits, comes back; 1 minute in background ends live
  liveReset();LQ=[{text:'wapas aaya'}];script=[{msg:'Ok.'}];doc.hidden=true;
  ev('vcLiveStart()');await sleep(60);
  ok(all('listen').length===0,'app hidden: mic not opened');
  doc.hidden=false;ok(await waitFor(()=>all('listen').length>=1),'app visible again: loop continues');
  ev('vcLiveStop()');await sleep(20);
  liveReset();doc.hidden=true;ev('vcLiveStart()');await sleep(30);ev('VC.hidAt=Date.now()-61000');
  ok(await waitFor(()=>!ev('VC.live'))&&ev("H.some(x=>x.info&&/background/.test(x.content))"),'1 minute in background ends live mode');
  doc.hidden=false;
  // H: Settings "Reply kab bole = off" still speaks in live mode
  liveReset();ev("S.vc={engine:'android',on:true,say:'off'}");LQ=[{text:'bolo'}];script=[{msg:'Bol raha hu.'}];
  ev('vcLiveStart()');ok(await waitFor(()=>all('speakAndroid').length>=1),'live mode speaks even when "Reply kab bole" is off');
  ev('vcLiveStop()');await sleep(20);
  // I: mic button: long press = live on/off, tap while live = off, plain tap = one listen
  liveReset();LQ=[];const mb=els['#micb'];
  mb.dispatchEvent({type:'pointerdown'});await sleep(30);
  ok(ev('VC.live')===true,'long press on the mic starts live mode');
  mb.dispatchEvent({type:'pointerup'});mb.onclick();
  ok(ev('VC.live')===true,'the click that follows the long press is ignored');
  await waitFor(()=>all('listen').length>=1);
  await mb.onclick();await sleep(20);
  ok(ev('VC.live')===false,'plain tap while live = stop live mode');
  mb.dispatchEvent({type:'pointerdown'});await sleep(30);mb.dispatchEvent({type:'pointerup'});mb.onclick();
  ok(ev('VC.live')===true,'long press again = live on');
  mb.dispatchEvent({type:'pointerdown'});await sleep(30);mb.dispatchEvent({type:'pointerup'});mb.onclick();await sleep(20);
  ok(ev('VC.live')===false,'long press while live = live off');
  liveReset();LQ=[{text:'sirf ek baar'}];script=[{msg:'Ek hi baar.'}];mb.dispatchEvent({type:'pointerdown'});mb.dispatchEvent({type:'pointerup'});await mb.onclick();await idle();
  ok(ev('VC.live')===false&&all('listen').length===1,'short tap = one listen, as in v0.1 (no live mode)');
  // J: voice off while live
  liveReset();LQ=[];ev('vcLiveStart()');await waitFor(()=>all('listen').length>=1);
  els['#vc_on']=mk('#vc_on');els['#vc_on'].value='off';ev('vcRead()');
  ok(await waitFor(()=>!ev('VC.live')),'turning Voice off in Settings ends live mode');
  ok(/Mic ko lamba dabao/.test(ev('vcSettingsHtml()')),'Settings > Voice explains the long press');
  ev("S.vc={}");LQ=null;
  const swait=()=>0;

  // ---------- keys import ----------
  ev("S.vc={}");
  const pk=ev("parseKeys('ElevenLabs: sk_abcdefghijklmnopqrstuvwx1234\\nsk_zzzzzzzzzzzzzzzzzzzzzzzz9999\\ngroq: gsk_1234567890abcd')");
  ok(pk.el&&pk.el.length===2&&pk.keys.groq&&pk.keys.groq.length===1,'parseKeys: 2 ElevenLabs keys (label + sk_ prefix) and groq kept apart');
  ok(ev("sumr(parseKeys('eleven_key=sk_abcdefghijklmnopqrstuvwx1234')).join()")==='ElevenLabs: 1 key','import summary names ElevenLabs');
  ev("applyKeys(parseKeys('ElevenLabs: sk_abcdefghijklmnopqrstuvwx1234, sk_zzzzzzzzzzzzzzzzzzzzzzzz9999'))");
  ok(ev("vcKeys().length")===2&&ev("S.vc.engine")==='eleven','applyKeys stores keys in Voice settings, defaults kept');
  ev("applyKeys(parseKeys('sk_abcdefghijklmnopqrstuvwx1234'))");
  ok(ev("vcKeys().length")===2,'importing the same key again does not duplicate it');
  ok(!ev("JSON.stringify(S.keys)").includes('sk_abc'),'ElevenLabs key did not go into the chat provider keys');
  ok(ev("sumr(parseKeys('deepseek: sk-'+'abcdefghijklmnopqrstuvwxyz123456')).join()").indexOf('DeepSeek')===0,'DeepSeek sk- keys still detected as before');

  // ---------- settings ----------
  const sh=ev('vcSettingsHtml()');
  ok(['vc_on','vc_say','vc_eng','vc_keys','vc_model','vc_voice','vc_speed','vc_lang','vc_test','vc_lm','vc_lv'].every(id=>sh.includes('id="'+id+'"')),'Settings > Voice has all fields');
  ok(!/sk_abc/.test(ev("(S.vc={keys:''},vcSettingsHtml())")),'settings html has no key when none saved');
  ev("S.vc={}");
  const full=fs.readFileSync('js/settings.js','utf8');
  ok(/vcSettingsHtml/.test(full)&&/vcBind\(\)/.test(full)&&/vcRead\(\)/.test(full),'settings.js shows, binds and saves the Voice section');
  els['#vc_on']=mk('#vc_on');els['#vc_on'].value='on';
  for(const [id,v] of [['vc_say','all'],['vc_eng','android'],['vc_keys','a1a1a1a1, b2b2b2b2\nc3c3c3c3'],['vc_model',' m_x '],['vc_voice',' vv1 '],['vc_speed','9'],['vc_lang','en-IN']]){els['#'+id]=mk('#'+id);els['#'+id].value=v}
  const f=ev('vcForm()');
  ok(f.say==='all'&&f.engine==='android'&&f.keys==='a1a1a1a1, b2b2b2b2, c3c3c3c3'&&f.model==='m_x'&&f.voice==='vv1'&&f.speed===1.2&&f.lang==='en-IN','form read: trimmed, keys normalised, speed clamped to 1.2');
  els['#vc_speed'].value='0.1';ok(ev('vcForm().speed')===0.7,'speed clamped to 0.7');

  // ---------- wiring / files ----------
  const idx=fs.readFileSync('index.html','utf8'),pa=fs.readFileSync('../scripts/patch-android.js','utf8'),jv=fs.readFileSync('../native/VoicePlugin.java','utf8'),vj=fs.readFileSync('js/voice.js','utf8');
  ok(idx.includes('id="micb"')&&idx.indexOf('js/voice.js')>idx.indexOf('js/bubble.js')&&idx.indexOf('js/voice.js')<idx.indexOf('js/main.js'),'index.html: mic button and voice.js before main.js');
  ok(!/[\u{1F300}-\u{1FAFF}]/u.test(vj+idx),'no emoji in voice UI code');
  ok(pa.includes("'VoicePlugin.java'")&&pa.includes('registerPlugin(VoicePlugin.class)')&&pa.includes('android.permission.RECORD_AUDIO')&&pa.includes('android.speech.RecognitionService')&&pa.includes('android.intent.action.TTS_SERVICE'),'patch-android: copies + registers VoicePlugin, RECORD_AUDIO, service queries');
  ok(/@CapacitorPlugin\(name = "Voice"/.test(jv),'native plugin name is Voice');
  const used=[...new Set([...vj.matchAll(/NV\('(\w+)'/g)].map(x=>x[1]))];
  ok(used.length>=8&&used.every(m=>new RegExp('public void '+m+'\\(').test(jv)),'every NV(method) used in voice.js exists in VoicePlugin.java: '+used.join(','));
  ok(!/sk_[A-Za-z0-9]{10,}|xi-api-key["']?\s*:\s*["'][A-Za-z0-9]/.test(vj+jv),'no key hardcoded');
  ok(!/c\.setRequestProperty\("xi-api-key", "/.test(jv)&&!/call\.reject\([^;]*key[^;]*\+/.test(jv.replace(/"key ya what galat"|"key \/ voice/g,'')),'native never puts the key into an error message');

  console.log('\n'+pass+' pass, '+fail+' fail');process.exit(fail?1:0);
})().catch(e=>{console.log('SIM ERROR',e);process.exit(2)});
